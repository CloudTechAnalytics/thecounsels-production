import { supabase } from '@/shared/lib/supabase'

/**
 * Cross-cutting storage-quota reads/checks — spans documents, billing
 * (receipts) and HR (employee documents), so this lives here rather than
 * inside any one feature, same reasoning as admin-users.service.ts.
 *
 * Usage/limit/breakdown/largest-files all go through security-definer RPCs
 * (migration 0108) rather than plain RLS-scoped reads, so the numbers are
 * always the TRUE org-wide total regardless of the calling user's own
 * billing/HR permission scope — a Firm Settings viewer without billing.view
 * still sees an accurate figure, not a silently-truncated one.
 */
export interface StorageAvailability {
  allowed: boolean
  usedBytes: number
  limitBytes: number
  remainingBytes: number
}

export interface StorageBreakdown {
  documents: number
  matterAttachments: number
  hrDocuments: number
  expenseReceipts: number
}

export interface LargestFile {
  source: 'document' | 'expense_receipt' | 'hr_document'
  id: string
  name: string
  sizeBytes: number
  uploadedByName: string | null
  createdAt: string
  matterId: string | null
  employeeUserId: string | null
}

export const storageQuotaService = {
  async getUsage(organizationId: string): Promise<number> {
    const { data, error } = await supabase.rpc('org_storage_usage', { p_org: organizationId })
    if (error) throw error
    return data ?? 0
  },

  async getLimit(organizationId: string): Promise<number> {
    const { data, error } = await supabase.rpc('org_storage_limit_bytes', { p_org: organizationId })
    if (error) throw error
    return data ?? 0
  },

  /** Fast fail-fast check before spending an actual upload round-trip — the
   * DB trigger (migration 0108) remains the authoritative, race-safe
   * enforcement regardless of what this optimistic check decides. */
  async checkAvailability(organizationId: string, newFileBytes: number): Promise<StorageAvailability> {
    const [usedBytes, limitBytes] = await Promise.all([
      this.getUsage(organizationId),
      this.getLimit(organizationId),
    ])
    const remainingBytes = Math.max(0, limitBytes - usedBytes)
    return {
      // limitBytes === 0 means "no subscription/plan configured" — never
      // silently lock an org out client-side; the trigger has the same escape hatch.
      allowed: limitBytes === 0 || usedBytes + newFileBytes <= limitBytes,
      usedBytes,
      limitBytes,
      remainingBytes,
    }
  },

  async getBreakdown(organizationId: string): Promise<StorageBreakdown> {
    const { data, error } = await supabase.rpc('org_storage_breakdown', { p_org: organizationId })
    if (error) throw error
    const byCategory = new Map((data ?? []).map((r) => [r.category, r.bytes]))
    return {
      documents: byCategory.get('documents') ?? 0,
      matterAttachments: byCategory.get('matter_attachments') ?? 0,
      hrDocuments: byCategory.get('hr_documents') ?? 0,
      expenseReceipts: byCategory.get('expense_receipts') ?? 0,
    }
  },

  async getLargestFiles(organizationId: string, limit = 20): Promise<LargestFile[]> {
    const { data, error } = await supabase.rpc('org_largest_files', { p_org: organizationId, p_limit: limit })
    if (error) throw error
    return (data ?? []).map((r) => ({
      source: r.source as LargestFile['source'],
      id: r.id,
      name: r.name,
      sizeBytes: r.size_bytes,
      uploadedByName: r.uploaded_by_name,
      createdAt: r.created_at,
      matterId: r.matter_id,
      employeeUserId: r.employee_user_id,
    }))
  },
}

/** Shared error message, matching the DB trigger's own wording (migration
 * 0108) so a fail-fast client rejection and a trigger rejection read
 * identically to the user either way. */
export function storageLimitMessage(usedBytes: number, limitBytes: number, formatStorage: (b: number) => string): string {
  return `Storage limit reached. Your organization has used ${formatStorage(usedBytes)} of ${formatStorage(limitBytes)} storage allowance. Please delete unused files or upgrade your storage plan.`
}
