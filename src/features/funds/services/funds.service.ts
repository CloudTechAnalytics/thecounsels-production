import { supabase } from '@/shared/lib/supabase'
import { storageQuotaService, storageLimitMessage } from '@/shared/services/storage-quota.service'
import { formatStorage } from '@/shared/lib/format'
import {
  DEFAULT_FUND_SETTINGS,
  type FundRequest, type FundSettings, type FundApprovalRow, type FundRequestRow, type FundRetirementItem,
} from '@/features/funds/types'

const REQUEST_SELECT = `*,
  requester:profiles!fund_requests_user_id_fkey(full_name, email),
  disburser:profiles!fund_requests_disbursed_by_fkey(full_name),
  matter:matters(matter_number, title),
  approvals:fund_request_approvals(*,
    approver:profiles!fund_request_approvals_approver_id_fkey(full_name),
    actor:profiles!fund_request_approvals_acted_by_fkey(full_name)),
  items:fund_retirement_items(*)`

type RawApproval = FundApprovalRow & { approver: { full_name: string | null } | null; actor: { full_name: string | null } | null }
type RawRequest = FundRequestRow & {
  requester: { full_name: string | null; email: string | null } | null
  disburser: { full_name: string | null } | null
  matter: { matter_number: string | null; title: string } | null
  approvals: RawApproval[] | null
  items: FundRetirementItem[] | null
}

function shape(r: RawRequest): FundRequest {
  const { requester, disburser, matter, approvals, items, ...row } = r
  return {
    ...row,
    requester_name: requester?.full_name ?? requester?.email ?? null,
    disbursed_by_name: disburser?.full_name ?? null,
    matter_label: matter ? [matter.matter_number, matter.title].filter(Boolean).join(' — ') : null,
    approvals: (approvals ?? [])
      .map(({ approver, actor, ...a }) => ({ ...a, approver_name: approver?.full_name ?? null, actor_name: actor?.full_name ?? null }))
      .sort((a, b) => a.step - b.step),
    items: (items ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }
}

export const fundsService = {
  async getSettings(organizationId: string): Promise<FundSettings> {
    const { data, error } = await supabase.from('fund_settings').select('*').eq('organization_id', organizationId).maybeSingle()
    if (error) throw error
    return data ?? { organization_id: organizationId, updated_by: null, updated_at: '', ...DEFAULT_FUND_SETTINGS }
  },
  async saveSettings(organizationId: string, patch: Pick<FundSettings, 'require_line_manager' | 'leadership_threshold' | 'retirement_due_days'>, userId: string | null): Promise<void> {
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

  async submitRequest(organizationId: string, input: {
    title: string; category: string; amount: number; neededBy?: string; matterId?: string; purpose?: string
  }): Promise<FundRequestRow> {
    const { data, error } = await supabase.rpc('submit_fund_request', {
      p_org: organizationId,
      p_title: input.title,
      p_category: input.category,
      p_amount: input.amount,
      p_needed_by: input.neededBy || null,
      p_matter: input.matterId || null,
      p_purpose: input.purpose || null,
    })
    if (error) throw error
    return data
  },
  async act(requestId: string, approve: boolean, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('act_on_fund_request', { p_request: requestId, p_approve: approve, p_comment: comment ?? null })
    if (error) throw error
  },
  async cancel(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_fund_request', { p_request: requestId })
    if (error) throw error
  },
  async disburse(requestId: string, amount: number, method?: string, reference?: string): Promise<void> {
    const { error } = await supabase.rpc('disburse_fund_request', {
      p_request: requestId, p_amount: amount, p_method: method || null, p_reference: reference || null,
    })
    if (error) throw error
  },

  async addRetirementItem(params: {
    organizationId: string
    requestId: string
    description: string
    amount: number
    spentOn?: string
    receipt?: File | null
  }): Promise<void> {
    const { organizationId, requestId, description, amount, spentOn, receipt } = params
    let path: string | null = null
    if (receipt) {
      const availability = await storageQuotaService.checkAvailability(organizationId, receipt.size)
      if (!availability.allowed) {
        throw new Error(storageLimitMessage(availability.usedBytes, availability.limitBytes, formatStorage))
      }
      path = `${organizationId}/${requestId}/${crypto.randomUUID()}-${receipt.name.replace(/[^\w.\-]+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('fund-receipts').upload(path, receipt, {
        contentType: receipt.type || 'application/octet-stream',
        upsert: false,
      })
      if (upErr) throw upErr
    }
    const { error } = await supabase.from('fund_retirement_items').insert({
      organization_id: organizationId,
      request_id: requestId,
      description,
      amount,
      spent_on: spentOn || null,
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
    const { data, error } = await supabase.storage.from('fund-receipts').createSignedUrl(path, 300)
    if (error) throw error
    return data.signedUrl
  },
  async submitRetirement(requestId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('submit_fund_retirement', { p_request: requestId, p_note: note || null })
    if (error) throw error
  },
  async reviewRetirement(requestId: string, accept: boolean, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('review_fund_retirement', { p_request: requestId, p_accept: accept, p_comment: comment || null })
    if (error) throw error
  },
}
