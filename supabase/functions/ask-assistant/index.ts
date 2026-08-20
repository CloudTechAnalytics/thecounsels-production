// ============================================================================
// Edge Function: ask-assistant
// A general schedule/workload AI assistant — "show upcoming hearings this
// week with client names and advocates" — distinct from the existing
// per-matter AI (summarize-matter/chat-with-matter, 0070/0102), which
// pre-fetches ONE matter's own context and never decides what to look up.
// This one uses Gemini function/tool calling to decide, per question,
// which of 3 tools to call (hearings/tasks/appointments), then answers in
// plain language. v1 is deliberately scoped to schedule/workload questions
// only — not clients, billing, or matter content.
//
// *** IMPORTANT — the one deliberate departure from summarize-matter's/
// chat-with-matter's own pattern: every tool-lookup query below runs
// through the RLS-scoped `caller` client, NOT `admin`. RLS does the org/
// permission scoping — there is no hand-written .eq('organization_id', …)
// substitute for it. Do NOT "fix" this by copying the admin-client
// pattern from the other two AI functions — that would let a user ask the
// assistant about hearings/tasks/appointments their own role can't see. ***
//
// Thinking is left ON here (thinkingConfig omitted) — current Gemini docs
// say thinking measurably improves function-calling accuracy. This is a
// deliberate, informed reversal of summarize-matter's/chat-with-matter's
// own thinkingBudget: 0 (which exists to avoid a *different* problem —
// thinking eating a small, fixed output budget on a one-shot answer).
//
// Deploy:  supabase functions deploy ask-assistant
//   (no --no-verify-jwt — called directly from the browser with the
//   signed-in user's own session, same as chat-with-matter.)
// Secrets: none new — GEMINI_API_KEY is already project-scoped.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const GEMINI_MODEL = 'gemini-flash-latest'
const MAX_TOKENS = 2048
const HISTORY_LIMIT = 20

const ASSIGNEE_ENUM = ['anyone', 'me'] as const

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'lookup_hearings',
        description: 'Look up court hearings (mentions, rulings, appearances) in a date range, with the matter, client and assigned advocates for each.',
        parameters: {
          type: 'object',
          properties: {
            from_date: { type: 'string', description: 'Start date, inclusive, ISO 8601 (yyyy-mm-dd or full timestamp).' },
            to_date: { type: 'string', description: 'End date, inclusive, ISO 8601.' },
            status: { type: 'string', enum: ['scheduled', 'held', 'adjourned', 'cancelled'], description: 'Optional status filter.' },
          },
          required: ['from_date', 'to_date'],
        },
      },
      {
        name: 'lookup_tasks',
        description: 'Look up tasks due in a date range, with status, priority, matter and assignee for each.',
        parameters: {
          type: 'object',
          properties: {
            from_date: { type: 'string', description: 'Start due-date, inclusive, ISO 8601 (yyyy-mm-dd).' },
            to_date: { type: 'string', description: 'End due-date, inclusive, ISO 8601 (yyyy-mm-dd).' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'cancelled'], description: 'Optional status filter.' },
            assignee: { type: 'string', enum: ASSIGNEE_ENUM as unknown as string[], description: '"me" to filter to the asking user\'s own tasks, "anyone" (default) for everyone\'s.' },
          },
          required: ['from_date', 'to_date'],
        },
      },
      {
        name: 'lookup_appointments',
        description: 'Look up client meetings and other non-court appointments in a date range, with client, matter and the assigned staff member for each.',
        parameters: {
          type: 'object',
          properties: {
            from_date: { type: 'string', description: 'Start date, inclusive, ISO 8601.' },
            to_date: { type: 'string', description: 'End date, inclusive, ISO 8601.' },
            status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled', 'no_show'], description: 'Optional status filter.' },
            assignee: { type: 'string', enum: ASSIGNEE_ENUM as unknown as string[], description: '"me" to filter to the asking user\'s own appointments, "anyone" (default) for everyone\'s.' },
          },
          required: ['from_date', 'to_date'],
        },
      },
    ],
  },
]

type FunctionCallPart = { functionCall: { name: string; id?: string; args?: Record<string, unknown> } }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: { organizationId?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { organizationId } = body
  const message = body.message?.trim()
  if (!organizationId) return json({ error: 'organizationId is required' }, 400)
  if (!message) return json({ error: 'message is required' }, 400)

  // Caller-scoped client — used for BOTH the membership check below and
  // every tool query later. RLS is the real access boundary throughout.
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)
  const userId = userData.user.id

  // Verify the caller actually belongs to the org they claim to be asking
  // about — a caller-scoped query, not a trusted client parameter: RLS
  // only returns this row if it's genuinely their own active membership.
  const { data: membership } = await caller
    .from('memberships')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) return json({ error: 'You are not an active member of this organization' }, 403)

  if (!GEMINI_API_KEY) return json({ error: 'The assistant is not configured yet — contact support.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  // Same plan gate as the per-matter AI — "AI capability," not a separate tier.
  const { data: hasFeature } = await admin.rpc('org_has_feature', { p_org: organizationId, p_feature: 'ai_summarization' })
  if (!hasFeature) {
    return json({ error: 'The AI assistant is available on the Business plan and above. Upgrade to use it.' }, 403)
  }

  const { data: history } = await admin
    .from('assistant_messages')
    .select('role, content, created_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const todayIso = new Date().toISOString().slice(0, 10)
  const systemInstruction = [
    'You are a legal practice assistant that answers schedule and workload questions for the firm staff member asking — hearings, tasks and appointments only.',
    'Plain text only — this is displayed as-is with no markdown rendering. No **bold**, no # headings, no * or - bullet symbols; use plain sentences or simple "Name — detail" lines instead.',
    `Today's date is ${todayIso}.`,
    'Use the lookup_hearings, lookup_tasks and lookup_appointments tools to find real data before answering anything about dates, names, or counts — never guess or invent them.',
    'If asked about anything outside schedule/workload (clients, billing, matter documents or content, firm settings, etc.), say that is outside what you can help with here and suggest the relevant page instead.',
    'Only report what the tools return — the tools already only return what this user is permitted to see, so if something is missing from the results, say you found nothing rather than assuming access was the issue.',
  ].join('\n')

  const orderedHistory = (history ?? []).slice().reverse()
  const contents: Array<{ role: string; parts: unknown[] }> = [
    ...orderedHistory.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  async function callGemini() {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: TOOLS,
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }),
      },
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('Gemini API error:', res.status, errText)
      return null
    }
    return res.json()
  }

  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const from = String(args.from_date ?? todayIso)
    const to = String(args.to_date ?? todayIso)
    const status = typeof args.status === 'string' ? args.status : undefined
    const assignee = typeof args.assignee === 'string' ? args.assignee : 'anyone'

    if (name === 'lookup_hearings') {
      let q = caller
        .from('hearings')
        .select('title, hearing_at, status, court, judge, matter:matters(id, title, matter_number, client:clients(display_name))')
        .eq('organization_id', organizationId)
        .gte('hearing_at', from)
        .lte('hearing_at', to <= from ? `${to}T23:59:59` : to)
        .order('hearing_at', { ascending: true })
        .limit(50)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return { error: error.message }
      const rows = (data ?? []) as unknown as { title: string; hearing_at: string; status: string; court: string | null; judge: string | null; matter: { id: string; title: string; matter_number: string; client: { display_name: string } | null } | null }[]
      const matterIds = [...new Set(rows.map((r) => r.matter?.id).filter((id): id is string => Boolean(id)))]
      let advocatesByMatter = new Map<string, string[]>()
      if (matterIds.length > 0) {
        const { data: assignments } = await caller
          .from('matter_assignments')
          .select('matter_id, user:profiles!matter_assignments_user_id_fkey(full_name)')
          .in('matter_id', matterIds)
        advocatesByMatter = new Map()
        for (const a of (assignments ?? []) as unknown as { matter_id: string; user: { full_name: string | null } | null }[]) {
          const list = advocatesByMatter.get(a.matter_id) ?? []
          if (a.user?.full_name) list.push(a.user.full_name)
          advocatesByMatter.set(a.matter_id, list)
        }
      }
      return rows.map((r) => ({
        title: r.title,
        hearing_at: r.hearing_at,
        status: r.status,
        court: r.court,
        judge: r.judge,
        matter: r.matter ? `${r.matter.matter_number} — ${r.matter.title}` : null,
        client: r.matter?.client?.display_name ?? null,
        advocates: r.matter ? (advocatesByMatter.get(r.matter.id) ?? []) : [],
      }))
    }

    if (name === 'lookup_tasks') {
      let q = caller
        .from('tasks')
        .select('title, status, priority, due_date, matter:matters(title, matter_number), assignee:profiles!tasks_assignee_id_fkey(full_name)')
        .eq('organization_id', organizationId)
        .gte('due_date', from)
        .lte('due_date', to)
        .order('due_date', { ascending: true })
        .limit(50)
      if (status) q = q.eq('status', status)
      if (assignee === 'me') q = q.eq('assignee_id', userId)
      const { data, error } = await q
      if (error) return { error: error.message }
      const rows = (data ?? []) as unknown as { title: string; status: string; priority: string; due_date: string | null; matter: { title: string; matter_number: string } | null; assignee: { full_name: string | null } | null }[]
      return rows.map((r) => ({
        title: r.title,
        status: r.status,
        priority: r.priority,
        due_date: r.due_date,
        matter: r.matter ? `${r.matter.matter_number} — ${r.matter.title}` : null,
        assignee: r.assignee?.full_name ?? null,
      }))
    }

    if (name === 'lookup_appointments') {
      let q = caller
        .from('appointments')
        .select('title, appointment_at, status, location, client:clients(display_name), matter:matters(title, matter_number), assigned_to:profiles!appointments_assigned_to_id_fkey(full_name)')
        .eq('organization_id', organizationId)
        .gte('appointment_at', from)
        .lte('appointment_at', to <= from ? `${to}T23:59:59` : to)
        .order('appointment_at', { ascending: true })
        .limit(50)
      if (status) q = q.eq('status', status)
      if (assignee === 'me') q = q.eq('assigned_to_id', userId)
      const { data, error } = await q
      if (error) return { error: error.message }
      const rows = (data ?? []) as unknown as { title: string; appointment_at: string; status: string; location: string | null; client: { display_name: string } | null; matter: { title: string; matter_number: string } | null; assigned_to: { full_name: string | null } | null }[]
      return rows.map((r) => ({
        title: r.title,
        appointment_at: r.appointment_at,
        status: r.status,
        location: r.location,
        client: r.client?.display_name ?? null,
        matter: r.matter ? `${r.matter.matter_number} — ${r.matter.title}` : null,
        assigned_to: r.assigned_to?.full_name ?? null,
      }))
    }

    return { error: `Unknown tool: ${name}` }
  }

  const first = await callGemini()
  if (!first) return json({ error: 'Could not get a reply right now. Please try again.' }, 502)

  const firstParts: Array<{ text?: string } | FunctionCallPart> = first.candidates?.[0]?.content?.parts ?? []
  const calls = firstParts.filter((p): p is FunctionCallPart => 'functionCall' in p)

  let finalData = first
  if (calls.length > 0) {
    const responses = await Promise.all(
      calls.map(async (c) => ({
        functionResponse: {
          name: c.functionCall.name,
          ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
          response: { result: await runTool(c.functionCall.name, c.functionCall.args ?? {}) },
        },
      })),
    )
    contents.push({ role: 'model', parts: firstParts })
    contents.push({ role: 'user', parts: responses })
    const second = await callGemini()
    if (!second) return json({ error: 'Could not get a reply right now. Please try again.' }, 502)
    finalData = second
  }

  const finalParts: { text?: string }[] = finalData.candidates?.[0]?.content?.parts ?? []
  const reply: string = finalParts.map((p) => p.text ?? '').join('').trim()
  if (!reply) return json({ error: 'The assistant did not return a reply. Please try again.' }, 502)

  const { error: insertErr } = await admin.from('assistant_messages').insert([
    { organization_id: organizationId, user_id: userId, role: 'user', content: message },
    { organization_id: organizationId, user_id: userId, role: 'assistant', content: reply },
  ])
  if (insertErr) console.error('Could not save assistant messages:', insertErr)

  return json({ reply })
})
