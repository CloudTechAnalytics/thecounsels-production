// ============================================================================
// Edge Function: generate-data-export
// Self-serve organization data export (0134, reworked to .xlsx per the
// conversation this was built in — a firm's own staff won't necessarily
// know what to do with a JSON file). Fulfills what the Privacy Policy
// already promises ("receive a copy of your data in a portable format").
// Produces one Excel workbook, one sheet per record type, with human-
// readable labels (matter number + title, client name, staff name)
// instead of raw UUIDs wherever a row references another record — built
// to actually be opened and understood, not just technically portable.
//
// v1 scope, deliberately: matters and everything on them (tasks, hearings,
// appointments, notes, documents, invoices/items, payments, expenses,
// timeline), clients, and branches. NOT included yet: internal messaging,
// support tickets, audit log, HR records — a real scope decision
// (documented in the conversation this was built in), not an oversight.
//
// Deploy:  supabase functions deploy generate-data-export
//   (no --no-verify-jwt — called directly from the browser with the
//   signed-in user's own session, same posture as summarize-matter.)
// Secrets: none new.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

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

function fmtBytes(n: number | null): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16)
}

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
      { data: members },
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
      admin.from('memberships').select('user_id, profile:profiles(full_name, email)').eq('organization_id', organizationId),
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

    // Human-readable lookups — every sheet below uses these instead of raw
    // UUIDs, which is the whole point of switching away from a JSON dump.
    const userLabel = new Map<string, string>()
    for (const m of (members ?? []) as unknown as { user_id: string; profile: { full_name: string | null; email: string } | null }[]) {
      userLabel.set(m.user_id, m.profile?.full_name || m.profile?.email || 'Unknown')
    }
    const matterLabel = new Map<string, string>()
    for (const m of matters ?? []) matterLabel.set(m.id, `${m.matter_number ?? ''} — ${m.title}`.replace(/^— /, ''))
    const clientLabel = new Map<string, string>()
    for (const c of clients ?? []) clientLabel.set(c.id, c.display_name)
    const invoiceLabel = new Map<string, string>()
    for (const i of invoices ?? []) invoiceLabel.set(i.id, i.invoice_number ?? i.id.slice(0, 8))
    const u = (id: string | null) => (id ? userLabel.get(id) ?? '' : '')
    const mt = (id: string | null) => (id ? matterLabel.get(id) ?? '' : '')
    const cl = (id: string | null) => (id ? clientLabel.get(id) ?? '' : '')

    // Signed URLs for every document in one batch call rather than one
    // round-trip each — matters for firms with a real document count.
    const docPaths = (documents ?? []).map((d) => d.storage_path)
    const { data: signedUrls } = docPaths.length > 0
      ? await admin.storage.from('documents').createSignedUrls(docPaths, SIGNED_URL_SECONDS)
      : { data: [] as { path: string | null; signedUrl: string }[] | null }
    const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]))

    const wb = XLSX.utils.book_new()
    const addSheet = (name: string, rows: Record<string, unknown>[]) => {
      // Every sheet gets at least a header row, even with zero data, so
      // opening the file never looks broken — just empty.
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)) // Excel's own 31-char sheet-name limit
    }

    addSheet('Overview', [{
      Organization: org?.name ?? '',
      'Legal Name': org?.legal_name ?? '',
      Website: org?.website ?? '',
      Phone: org?.phone ?? '',
      'Exported At': fmtDate(new Date().toISOString()),
      'Requested By': u(userData.user.id),
      Matters: (matters ?? []).length,
      Clients: (clients ?? []).length,
      Documents: (documents ?? []).length,
      Invoices: (invoices ?? []).length,
    }])

    addSheet('Matters', (matters ?? []).map((m) => ({
      'Matter Number': m.matter_number ?? '',
      Title: m.title,
      Status: m.status,
      Priority: m.priority,
      'Practice Area': m.practice_area ?? '',
      Client: cl(m.client_id),
      'Lead Lawyer': u(m.lead_lawyer_id),
      Court: m.court ?? '',
      Judge: m.judge ?? '',
      'Opposing Counsel': m.opposing_counsel ?? '',
      'Opened On': m.opened_on ?? '',
      'Closed On': m.closed_on ?? '',
      Description: m.description ?? '',
    })))

    addSheet('Clients', (clients ?? []).map((c) => ({
      Name: c.display_name,
      Type: c.type,
      Email: c.email ?? '',
      Phone: c.phone ?? '',
      Company: c.company_name ?? '',
      Address: [c.address, c.city, c.country].filter(Boolean).join(', '),
      Status: c.status,
      Notes: c.notes ?? '',
    })))

    addSheet('Tasks', (tasks ?? []).map((t) => ({
      Matter: mt(t.matter_id),
      Title: t.title,
      Status: t.status,
      Priority: t.priority,
      Assignee: u(t.assignee_id),
      'Due Date': t.due_date ?? '',
      'Completed At': fmtDate(t.completed_at),
      Description: t.description ?? '',
    })))

    addSheet('Hearings', (hearings ?? []).map((h) => ({
      Matter: mt(h.matter_id),
      Title: h.title,
      'Date & Time': fmtDate(h.hearing_at),
      Type: h.type,
      Status: h.status,
      Court: h.court ?? '',
      Judge: h.judge ?? '',
      Location: h.location ?? '',
      Outcome: h.outcome ?? '',
      Notes: h.notes ?? '',
    })))

    addSheet('Appointments', (appointments ?? []).map((a) => ({
      Matter: mt(a.matter_id),
      Client: cl(a.client_id),
      Title: a.title,
      'Date & Time': fmtDate(a.appointment_at),
      Status: a.status,
      'Assigned To': u(a.assigned_to_id),
      Location: a.location ?? '',
      Notes: a.notes ?? '',
    })))

    addSheet('Notes', (notes ?? []).map((n) => ({
      Matter: mt(n.matter_id),
      Author: u(n.author_id),
      'Created At': fmtDate(n.created_at),
      Note: n.body,
    })))

    addSheet('Documents', (documents ?? []).map((d) => ({
      Matter: mt(d.matter_id),
      'File Name': d.display_name,
      Category: d.category ?? '',
      'Uploaded By': u(d.uploaded_by),
      'Uploaded At': fmtDate(d.created_at),
      Size: fmtBytes(d.size_bytes),
      'Download Link (valid 7 days)': urlByPath.get(d.storage_path) ?? '',
    })))

    addSheet('Invoices', (invoices ?? []).map((i) => ({
      'Invoice Number': i.invoice_number ?? '',
      Matter: mt(i.matter_id),
      Client: cl(i.client_id),
      Status: i.status,
      'Issue Date': i.issue_date,
      'Due Date': i.due_date ?? '',
      Subtotal: i.subtotal,
      Tax: i.tax,
      Discount: i.discount,
      Total: i.total,
      'Amount Paid': i.amount_paid,
    })))

    addSheet('Invoice Items', (invoiceItems ?? []).map((it) => ({
      'Invoice Number': invoiceLabel.get(it.invoice_id) ?? '',
      Kind: it.kind,
      Description: it.description,
      Quantity: it.quantity,
      Rate: it.rate,
      Amount: it.amount,
    })))

    addSheet('Payments', (payments ?? []).map((p) => ({
      Matter: mt(p.matter_id),
      Client: cl(p.client_id),
      'Invoice Number': invoiceLabel.get(p.invoice_id) ?? '',
      'Payment Number': p.payment_number ?? '',
      'Receipt Number': p.receipt_number ?? '',
      Amount: p.amount,
      Method: p.method ?? '',
      'Paid At': fmtDate(p.paid_at),
    })))

    addSheet('Expenses', (expenses ?? []).map((e) => ({
      Matter: mt(e.matter_id),
      Description: e.description,
      Category: e.category ?? '',
      Amount: e.amount,
      Billable: e.billable ? 'Yes' : 'No',
      Invoiced: e.invoiced ? 'Yes' : 'No',
      Date: e.expense_date,
    })))

    addSheet('Timeline', (events ?? []).map((e) => ({
      Matter: mt(e.matter_id),
      Actor: u(e.actor_id),
      Event: e.kind,
      Summary: e.summary,
      When: fmtDate(e.created_at),
    })))

    addSheet('Branches', (branches ?? []).map((b) => ({
      Name: b.name,
      Code: b.code ?? '',
      Address: [b.address, b.city, b.state, b.country].filter(Boolean).join(', '),
      Phone: b.phone ?? '',
      Email: b.email ?? '',
      'Head Office': b.is_head_office ? 'Yes' : 'No',
    })))

    const workbookBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const filePath = `${organizationId}/${request.id}.xlsx`
    const { error: uploadErr } = await admin.storage
      .from('data-exports')
      .upload(filePath, new Blob([workbookBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
