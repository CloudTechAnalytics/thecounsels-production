// ============================================================================
// Edge Function: generate-data-export
// Self-serve organization data export (0134) — fulfills what the Privacy
// Policy already promises ("receive a copy of your data in a portable
// format"). Assembles a curated, matter-organized JSON export — not a raw
// table dump — and uploads it to the private data-exports Storage bucket.
//
// v1 scope, deliberately: matters (with their own tasks, hearings,
// appointments, notes, documents, invoices/items, payments, expenses,
// timeline), clients, branches, and the org profile itself. NOT included
// yet: internal messaging, support tickets, audit log, HR records — a
// real scope decision (documented in the conversation this was built in),
// not an oversight. Extend the QUERIES/buildExport section below if that
// scope should grow.
//
// Deploy:  supabase functions deploy generate-data-export
//   (no --no-verify-jwt — called directly from the browser with the
//   signed-in user's own session, same posture as summarize-matter.)
// Secrets: none new.
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

const EXPIRES_IN_DAYS = 7
const SIGNED_URL_SECONDS = EXPIRES_IN_DAYS * 24 * 60 * 60

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: { organizationId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { organizationId } = body
  if (!organizationId) return json({ error: 'organizationId is required' }, 400)

  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  // Real permission check, not the frontend's own gate — this touches
  // billing/financial data, matching organization-settings.tsx's own
  // 'organization.manage' gate for admin-only actions on this same page.
  const { data: canManage } = await caller.rpc('has_permission', { org: organizationId, perm: 'organization.manage' })
  if (!canManage) return json({ error: 'You do not have permission to export this organization\'s data.' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: request, error: insertErr } = await admin
    .from('data_export_requests')
    .insert({ organization_id: organizationId, requested_by: userData.user.id, status: 'processing' })
    .select('id')
    .single()
  if (insertErr || !request) return json({ error: 'Could not start export' }, 500)

  const fail = async (message: string) => {
    await admin.from('data_export_requests').update({ status: 'failed', error: message }).eq('id', request.id)
    return json({ error: message }, 500)
  }

  try {
    const [
      { data: org },
      { data: branches },
      { data: clients },
      { data: matters },
      { data: tasks },
      { data: hearings },
      { data: appointments },
      { data: notes },
      { data: documents },
      { data: invoices },
      { data: invoiceItems },
      { data: payments },
      { data: expenses },
      { data: events },
    ] = await Promise.all([
      admin.from('organizations').select('id, name, slug, legal_name, website, phone, industry').eq('id', organizationId).single(),
      admin.from('branches').select('*').eq('organization_id', organizationId),
      admin.from('clients').select('*').eq('organization_id', organizationId),
      admin.from('matters').select('*').eq('organization_id', organizationId),
      admin.from('tasks').select('*').eq('organization_id', organizationId),
      admin.from('hearings').select('*').eq('organization_id', organizationId),
      admin.from('appointments').select('*').eq('organization_id', organizationId),
      admin.from('matter_notes').select('*').eq('organization_id', organizationId),
      admin.from('documents').select('*').eq('organization_id', organizationId),
      admin.from('invoices').select('*').eq('organization_id', organizationId),
      admin.from('invoice_items').select('*').eq('organization_id', organizationId),
      admin.from('payments').select('*').eq('organization_id', organizationId),
      admin.from('expenses').select('*').eq('organization_id', organizationId),
      admin.from('matter_events').select('*').eq('organization_id', organizationId),
    ])

    // Signed URLs for every document in one batch call rather than one
    // round-trip each — matters for firms with a real document count.
    const docPaths = (documents ?? []).map((d) => d.storage_path)
    const { data: signedUrls } = docPaths.length > 0
      ? await admin.storage.from('documents').createSignedUrls(docPaths, SIGNED_URL_SECONDS)
      : { data: [] as { path: string | null; signedUrl: string }[] | null }
    const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]))
    const docsWithUrls = (documents ?? []).map((d) => ({ ...d, downloadUrl: urlByPath.get(d.storage_path) ?? null }))

    const itemsByInvoice = new Map<string, unknown[]>()
    for (const item of invoiceItems ?? []) {
      const list = itemsByInvoice.get(item.invoice_id) ?? []
      list.push(item)
      itemsByInvoice.set(item.invoice_id, list)
    }
    const invoicesWithItems = (invoices ?? []).map((inv) => ({ ...inv, items: itemsByInvoice.get(inv.id) ?? [] }))

    // Bucket everything matter-scoped by matter_id, so the export reads the
    // way a person thinks about their own practice — "this matter and
    // everything on it" — not as a pile of separate tables joined by UUID.
    const byMatter = <T extends { matter_id: string | null }>(rows: T[]) => {
      const map = new Map<string, T[]>()
      const standalone: T[] = []
      for (const r of rows) {
        if (r.matter_id) {
          const list = map.get(r.matter_id) ?? []
          list.push(r)
          map.set(r.matter_id, list)
        } else {
          standalone.push(r)
        }
      }
      return { map, standalone }
    }
    const tasksByMatter = byMatter(tasks ?? [])
    const hearingsByMatter = byMatter(hearings ?? [])
    const appointmentsByMatter = byMatter(appointments ?? [])
    const notesByMatter = byMatter(notes ?? [])
    const docsByMatter = byMatter(docsWithUrls)
    const invoicesByMatter = byMatter(invoicesWithItems)
    const paymentsByMatter = byMatter(payments ?? [])
    const expensesByMatter = byMatter(expenses ?? [])
    const eventsByMatter = new Map<string, unknown[]>()
    for (const e of events ?? []) {
      const list = eventsByMatter.get(e.matter_id) ?? []
      list.push(e)
      eventsByMatter.set(e.matter_id, list)
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      organization: org,
      branches: branches ?? [],
      clients: clients ?? [],
      matters: (matters ?? []).map((m) => ({
        ...m,
        tasks: tasksByMatter.map.get(m.id) ?? [],
        hearings: hearingsByMatter.map.get(m.id) ?? [],
        appointments: appointmentsByMatter.map.get(m.id) ?? [],
        notes: notesByMatter.map.get(m.id) ?? [],
        documents: docsByMatter.map.get(m.id) ?? [],
        invoices: invoicesByMatter.map.get(m.id) ?? [],
        payments: paymentsByMatter.map.get(m.id) ?? [],
        expenses: expensesByMatter.map.get(m.id) ?? [],
        timeline: eventsByMatter.get(m.id) ?? [],
      })),
      // Everything above was created without a matter link (branch-level
      // tasks, general documents, etc.) — kept separate rather than
      // silently dropped.
      standalone: {
        tasks: tasksByMatter.standalone,
        hearings: hearingsByMatter.standalone,
        appointments: appointmentsByMatter.standalone,
        documents: docsByMatter.standalone,
        invoices: invoicesByMatter.standalone,
        payments: paymentsByMatter.standalone,
        expenses: expensesByMatter.standalone,
      },
    }

    const filePath = `${organizationId}/${request.id}.json`
    const { error: uploadErr } = await admin.storage
      .from('data-exports')
      .upload(filePath, new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true,
      })
    if (uploadErr) return await fail(`Could not save export file: ${uploadErr.message}`)

    const completedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await admin
      .from('data_export_requests')
      .update({ status: 'ready', file_path: filePath, completed_at: completedAt, expires_at: expiresAt })
      .eq('id', request.id)

    await admin.rpc('notify_user', {
      p_org: organizationId,
      p_user: userData.user.id,
      p_actor: null,
      p_category: 'documents',
      p_action: 'data_export.ready',
      p_entity_type: 'data_export_request',
      p_entity_id: request.id,
      p_title: 'Your data export is ready to download',
      p_priority: 'info',
    })

    return json({ requestId: request.id, status: 'ready' })
  } catch (err) {
    return await fail(err instanceof Error ? err.message : 'Export failed')
  }
})
