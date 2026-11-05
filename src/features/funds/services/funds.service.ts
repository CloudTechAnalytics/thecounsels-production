import { supabase } from '@/shared/lib/supabase'
import { storageQuotaService, storageLimitMessage } from '@/shared/services/storage-quota.service'
import { formatStorage } from '@/shared/lib/format'
import {
  DEFAULT_FUND_SETTINGS,
  type FundRequest, type FundSettings, type FundApprovalRow, type FundRequestRow, type FundRetirementItem,
  type FundAttachment, type FundRefund, type WorkflowWithSteps, type ApprovalWorkflow, type ApprovalWorkflowStep, type ApprovalDelegation,
} from '@/features/funds/types'

const REQUEST_SELECT = `*,
  requester:profiles!fund_requests_user_id_fkey(full_name, email),
  disburser:profiles!fund_requests_disbursed_by_fkey(full_name),
  matter:matters(matter_number, title),
  client:clients(display_name),
  approvals:fund_request_approvals(*,
    approver:profiles!fund_request_approvals_approver_id_fkey(full_name),
    actor:profiles!fund_request_approvals_acted_by_fkey(full_name)),
  items:fund_retirement_items(*),
  attachments:fund_request_attachments(*),
  refunds:fund_refunds(*)`

type RawApproval = FundApprovalRow & { approver: { full_name: string | null } | null; actor: { full_name: string | null } | null }
type RawRequest = FundRequestRow & {
  requester: { full_name: string | null; email: string | null } | null
  disburser: { full_name: string | null } | null
  matter: { matter_number: string | null; title: string } | null
  client: { display_name: string | null } | null
  approvals: RawApproval[] | null
  items: FundRetirementItem[] | null
  attachments: FundAttachment[] | null
  refunds: FundRefund[] | null
}

function shape(r: RawRequest): FundRequest {
  const { requester, disburser, matter, client, approvals, items, attachments, refunds, ...row } = r
  const all = (approvals ?? [])
    .map(({ approver, actor, ...a }) => ({ ...a, approver_name: approver?.full_name ?? null, actor_name: actor?.full_name ?? null }))
    .sort((a, b) => a.round - b.round || a.step - b.step)
  return {
    ...row,
    requester_name: requester?.full_name ?? requester?.email ?? null,
    disbursed_by_name: disburser?.full_name ?? null,
    matter_label: matter ? [matter.matter_number, matter.title].filter(Boolean).join(' — ') : null,
    client_label: client?.display_name ?? null,
    approvals: all,
    chain: all.filter((a) => a.round === row.current_round),
    items: (items ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    attachments: (attachments ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    refunds: (refunds ?? []).sort((a, b) => a.received_on.localeCompare(b.received_on)),
  }
}

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_')

async function uploadToBucket(organizationId: string, path: string, file: File) {
  const availability = await storageQuotaService.checkAvailability(organizationId, file.size)
  if (!availability.allowed) throw new Error(storageLimitMessage(availability.usedBytes, availability.limitBytes, formatStorage))
  const { error } = await supabase.storage.from('fund-receipts').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) throw error
}

export interface FundRequestInput {
  title: string
  category: string
  amount: number
  neededBy?: string
  matterId?: string
  clientId?: string
  purpose?: string
}

export interface DisbursementInput {
  amount: number
  method?: string
  reference?: string
  paidOn?: string
  notes?: string
  proof?: File | null
}

export const fundsService = {
  async getSettings(organizationId: string): Promise<FundSettings> {
    const { data, error } = await supabase.from('fund_settings').select('*').eq('organization_id', organizationId).maybeSingle()
    if (error) throw error
    return data ?? { organization_id: organizationId, updated_by: null, updated_at: '', ...DEFAULT_FUND_SETTINGS }
  },
  async saveSettings(
    organizationId: string,
    patch: Pick<FundSettings, 'require_line_manager' | 'leadership_threshold' | 'retirement_due_days' | 'retirement_due_basis'>,
    userId: string | null,
  ): Promise<void> {
    const { error } = await supabase
      .from('fund_settings')
      .upsert({ organization_id: organizationId, ...patch, updated_by: userId, updated_at: new Date().toISOString() })
    if (error) throw error
  },

  /** Every request the caller can see — RLS scopes it to their own, those
   * they approve, or all of them for finance/partners. */
  async listRequests(organizationId: string): Promise<FundRequest[]> {
    const { data, error } = await supabase
      .from('fund_requests')
      .select(REQUEST_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as RawRequest[]).map(shape)
  },
  /** Ids of requests whose open step the caller can decide right now
   * (directly or as a delegate) — computed by the same function the
   * server uses to accept the decision. */
  async myApprovalIds(organizationId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('my_fund_approvals', { p_org: organizationId })
    if (error) throw error
    return (data ?? []) as string[]
  },

  /** Creates or edits a draft (or a returned request), uploads any new
   * supporting files, then submits when asked. */
  async saveRequest(organizationId: string, input: FundRequestInput, opts: { requestId?: string; submit: boolean; files?: File[] }): Promise<FundRequestRow> {
    const args = {
      p_org: organizationId,
      p_title: input.title,
      p_category: input.category,
      p_amount: input.amount,
      p_request: opts.requestId ?? null,
      p_needed_by: input.neededBy || null,
      p_matter: input.matterId || null,
      p_client: input.clientId || null,
      p_purpose: input.purpose || null,
    }
    const hasFiles = (opts.files?.length ?? 0) > 0
    const { data: saved, error } = await supabase.rpc('save_fund_request', { ...args, p_submit: opts.submit && !hasFiles })
    if (error) throw error
    if (!hasFiles) return saved
    for (const f of opts.files!) await this.uploadAttachment(organizationId, saved.id, f, 'supporting')
    if (!opts.submit) return saved
    const { data: submitted, error: subErr } = await supabase.rpc('save_fund_request', { ...args, p_request: saved.id, p_submit: true })
    if (subErr) throw subErr
    return submitted
  },
  /** Pulls a pending request back to draft so it can be edited (only before any approver acts). */
  async recall(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('recall_fund_request', { p_request: requestId })
    if (error) throw error
  },
  async deleteDraft(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_fund_draft', { p_request: requestId })
    if (error) throw error
  },
  async decide(requestId: string, decision: 'approve' | 'reject' | 'return', comment?: string, amount?: number): Promise<void> {
    const { error } = await supabase.rpc('decide_fund_request', {
      p_request: requestId, p_decision: decision, p_comment: comment || null, p_amount: amount ?? null,
    })
    if (error) throw error
  },
  async cancel(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_fund_request', { p_request: requestId })
    if (error) throw error
  },
  async markProcessing(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_fund_payment_processing', { p_request: requestId })
    if (error) throw error
  },
  async disburse(organizationId: string, requestId: string, d: DisbursementInput): Promise<void> {
    if (d.proof) await this.uploadAttachment(organizationId, requestId, d.proof, 'payment_proof')
    const { error } = await supabase.rpc('disburse_fund_request', {
      p_request: requestId, p_amount: d.amount, p_method: d.method || null, p_reference: d.reference || null,
      p_paid_on: d.paidOn || null, p_notes: d.notes || null,
    })
    if (error) throw error
  },

  async uploadAttachment(organizationId: string, requestId: string, file: File, kind: 'supporting' | 'payment_proof'): Promise<void> {
    const folder = kind === 'supporting' ? 'attachments' : 'payment'
    const path = `${organizationId}/${requestId}/${folder}/${crypto.randomUUID()}-${safeName(file.name)}`
    await uploadToBucket(organizationId, path, file)
    const { error } = await supabase.from('fund_request_attachments').insert({
      organization_id: organizationId, request_id: requestId, kind, file_name: file.name,
      storage_path: path, mime_type: file.type || null, size_bytes: file.size,
    })
    if (error) {
      await supabase.storage.from('fund-receipts').remove([path])
      throw error
    }
  },
  async deleteAttachment(a: Pick<FundAttachment, 'id' | 'storage_path'>): Promise<void> {
    const { error } = await supabase.from('fund_request_attachments').delete().eq('id', a.id)
    if (error) throw error
    await supabase.storage.from('fund-receipts').remove([a.storage_path])
  },
  async fileUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('fund-receipts').createSignedUrl(path, 300)
    if (error) throw error
    return data.signedUrl
  },

  async addRetirementItem(params: {
    organizationId: string
    requestId: string
    description: string
    amount: number
    spentOn?: string
    category?: string
    vendor?: string
    notes?: string
    receipt?: File | null
  }): Promise<void> {
    const { organizationId, requestId, description, amount, spentOn, receipt, category, vendor, notes } = params
    let path: string | null = null
    if (receipt) {
      path = `${organizationId}/${requestId}/${crypto.randomUUID()}-${safeName(receipt.name)}`
      await uploadToBucket(organizationId, path, receipt)
    }
    const { error } = await supabase.from('fund_retirement_items').insert({
      organization_id: organizationId,
      request_id: requestId,
      description,
      amount,
      spent_on: spentOn || null,
      category: category || null,
      vendor: vendor || null,
      notes: notes || null,
      receipt_path: path,
      receipt_name: receipt?.name ?? null,
      receipt_mime: receipt?.type || null,
      receipt_size: receipt?.size ?? null,
    })
    if (error) {
      if (path) await supabase.storage.from('fund-receipts').remove([path])
      throw error
    }
  },
  async deleteRetirementItem(item: Pick<FundRetirementItem, 'id' | 'receipt_path'>): Promise<void> {
    const { error } = await supabase.from('fund_retirement_items').delete().eq('id', item.id)
    if (error) throw error
    if (item.receipt_path) await supabase.storage.from('fund-receipts').remove([item.receipt_path])
  },
  async receiptUrl(path: string): Promise<string> {
    return this.fileUrl(path)
  },
  async submitRetirement(requestId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('submit_fund_retirement', { p_request: requestId, p_note: note || null })
    if (error) throw error
  },
  async declareRefund(organizationId: string, requestId: string, r: { amount: number; returnedOn?: string; method?: string; reference?: string; notes?: string; evidence?: File | null }): Promise<void> {
    let path: string | null = null
    if (r.evidence) {
      path = `${organizationId}/${requestId}/refunds/${crypto.randomUUID()}-${safeName(r.evidence.name)}`
      await uploadToBucket(organizationId, path, r.evidence)
    }
    const { error } = await supabase.rpc('declare_fund_refund', {
      p_request: requestId, p_amount: r.amount, p_returned_on: r.returnedOn || null, p_method: r.method || null,
      p_reference: r.reference || null, p_notes: r.notes || null, p_evidence_path: path, p_evidence_name: r.evidence?.name ?? null,
    })
    if (error) {
      if (path) await supabase.storage.from('fund-receipts').remove([path])
      throw error
    }
  },
  async verifyRefund(refundId: string, confirm: boolean, reason?: string, allowExcess = false): Promise<void> {
    const { error } = await supabase.rpc('verify_fund_refund', { p_refund: refundId, p_confirm: confirm, p_reason: reason || null, p_allow_excess: allowExcess })
    if (error) throw error
  },
  async recordReimbursement(requestId: string, r: { amount: number; paidOn?: string; method?: string; reference?: string; notes?: string }): Promise<void> {
    const { error } = await supabase.rpc('record_fund_reimbursement', {
      p_request: requestId, p_amount: r.amount, p_paid_on: r.paidOn || null, p_method: r.method || null, p_reference: r.reference || null, p_notes: r.notes || null,
    })
    if (error) throw error
  },
  async reviewItems(requestId: string, decisions: { id: string; decision: 'accept' | 'reject' | 'return'; comment?: string }[]): Promise<void> {
    const { error } = await supabase.rpc('review_retirement_items', { p_request: requestId, p_decisions: decisions })
    if (error) throw error
  },
  async closeRetirement(requestId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('close_fund_retirement', { p_request: requestId, p_note: note || null })
    if (error) throw error
  },
  async setDueDate(requestId: string, due: string): Promise<void> {
    const { error } = await supabase.rpc('set_retirement_due_date', { p_request: requestId, p_due: due })
    if (error) throw error
  },
  async history(requestId: string) {
    const { data, error } = await supabase.rpc('fund_request_history', { p_request: requestId })
    if (error) throw error
    return data ?? []
  },
  async waiveReimbursement(requestId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('waive_fund_reimbursement', { p_request: requestId, p_note: note || null })
    if (error) throw error
  },
  async claimReimbursement(organizationId: string, requestId: string, c: { amount: number; reason?: string; evidence?: File | null }): Promise<void> {
    let path: string | null = null
    if (c.evidence) {
      path = `${organizationId}/${requestId}/refunds/${crypto.randomUUID()}-${safeName(c.evidence.name)}`
      await uploadToBucket(organizationId, path, c.evidence)
    }
    const { error } = await supabase.rpc('claim_fund_reimbursement', {
      p_request: requestId, p_amount: c.amount, p_reason: c.reason || null, p_evidence_path: path, p_evidence_name: c.evidence?.name ?? null,
    })
    if (error) {
      if (path) await supabase.storage.from('fund-receipts').remove([path])
      throw error
    }
  },
  async decideReimbursement(claimId: string, approve: boolean, amount?: number, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('decide_fund_reimbursement', { p_claim: claimId, p_approve: approve, p_amount: amount ?? null, p_reason: reason || null })
    if (error) throw error
  },
  async payReimbursement(claimId: string, p: { paidOn?: string; method?: string; reference?: string; notes?: string }): Promise<void> {
    const { error } = await supabase.rpc('pay_fund_reimbursement', {
      p_claim: claimId, p_paid_on: p.paidOn || null, p_method: p.method || null, p_reference: p.reference || null, p_notes: p.notes || null,
    })
    if (error) throw error
  },
  async myReimbursementApprovalIds(organizationId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('my_reimbursement_approvals', { p_org: organizationId })
    if (error) throw error
    return (data ?? []) as string[]
  },
  async withdrawItem(itemId: string): Promise<void> {
    const { error } = await supabase.rpc('withdraw_retirement_item', { p_item: itemId })
    if (error) throw error
  },
  async withdrawRefund(refundId: string): Promise<void> {
    const { error } = await supabase.rpc('withdraw_fund_refund', { p_refund: refundId })
    if (error) throw error
  },
  async recordRefund(requestId: string, r: { amount: number; receivedOn?: string; method?: string; reference?: string; notes?: string }): Promise<void> {
    const { error } = await supabase.rpc('record_fund_refund', {
      p_request: requestId, p_amount: r.amount, p_received_on: r.receivedOn || null,
      p_method: r.method || null, p_reference: r.reference || null, p_notes: r.notes || null,
    })
    if (error) throw error
  },
  async reviewRetirement(requestId: string, accept: boolean, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('review_fund_retirement', { p_request: requestId, p_accept: accept, p_comment: comment || null })
    if (error) throw error
  },

  // ---- Approval workflows ----
  async listWorkflows(organizationId: string): Promise<WorkflowWithSteps[]> {
    const [{ data: wfs, error }, { data: steps, error: sErr }] = await Promise.all([
      supabase.from('approval_workflows').select('*').eq('organization_id', organizationId).eq('module', 'fund_request').order('priority').order('created_at'),
      supabase.from('approval_workflow_steps').select('*').eq('organization_id', organizationId).order('step_order'),
    ])
    if (error) throw error
    if (sErr) throw sErr
    return (wfs ?? []).map((w) => ({ ...w, steps: (steps ?? []).filter((s) => s.workflow_id === w.id) }))
  },
  async saveWorkflow(
    organizationId: string,
    wf: Omit<ApprovalWorkflow, 'id' | 'organization_id' | 'module' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string },
    steps: Pick<ApprovalWorkflowStep, 'step_order' | 'name' | 'approver_type' | 'approver_value' | 'approver_user_id'>[],
  ): Promise<void> {
    if (steps.length === 0) throw new Error('Add at least one approval step')
    const { id, ...fields } = wf
    let workflowId = id
    if (workflowId) {
      const { error } = await supabase.from('approval_workflows').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', workflowId)
      if (error) throw error
      const { error: delErr } = await supabase.from('approval_workflow_steps').delete().eq('workflow_id', workflowId)
      if (delErr) throw delErr
    } else {
      const { data, error } = await supabase.from('approval_workflows').insert({ ...fields, organization_id: organizationId, module: 'fund_request' }).select('id').single()
      if (error) throw error
      workflowId = data.id
    }
    const { error: insErr } = await supabase.from('approval_workflow_steps').insert(
      steps.map((s) => ({ ...s, organization_id: organizationId, workflow_id: workflowId! })),
    )
    if (insErr) throw insErr
    await supabase.rpc('log_audit', {
      p_org: organizationId, p_action: id ? 'funds.workflow_updated' : 'funds.workflow_created',
      p_entity_type: 'approval_workflow', p_entity_id: workflowId!, p_summary: `Approval workflow "${wf.name}" ${id ? 'updated' : 'created'}`,
    })
  },
  async deleteWorkflow(organizationId: string, wf: Pick<ApprovalWorkflow, 'id' | 'name'>): Promise<void> {
    const { error } = await supabase.from('approval_workflows').delete().eq('id', wf.id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId, p_action: 'funds.workflow_deleted', p_entity_type: 'approval_workflow', p_entity_id: wf.id,
      p_summary: `Approval workflow "${wf.name}" deleted`,
    })
  },

  // ---- Delegation ----
  async listDelegations(organizationId: string): Promise<ApprovalDelegation[]> {
    const { data, error } = await supabase.from('approval_delegations').select('*').eq('organization_id', organizationId).order('starts_on', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  async createDelegation(organizationId: string, d: { delegator: string; delegate: string; startsOn: string; endsOn: string; reason?: string }): Promise<void> {
    const { error } = await supabase.from('approval_delegations').insert({
      organization_id: organizationId, delegator_user_id: d.delegator, delegate_user_id: d.delegate,
      starts_on: d.startsOn, ends_on: d.endsOn, reason: d.reason || null,
    })
    if (error) throw error
  },
  async endDelegation(id: string): Promise<void> {
    const { error } = await supabase.from('approval_delegations').update({ is_active: false }).eq('id', id)
    if (error) throw error
  },
}
