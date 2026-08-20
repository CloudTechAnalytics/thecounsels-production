import { supabase } from '@/shared/lib/supabase'
import type { DocumentRow, Matter, Profile } from '@/shared/types/database.types'
import { storageQuotaService, storageLimitMessage } from '@/shared/services/storage-quota.service'
import { formatStorage } from '@/shared/lib/format'

const BUCKET = 'documents'

export const DOCUMENT_CATEGORIES = [
  'Contracts',
  'Evidence',
  'Pleadings',
  'Engagement Letter',
  'Client Documents',
  'Court Filing',
  'Court Orders & Judgments',
  'Invoice',
  'Correspondence',
  'Internal Documents',
  'Miscellaneous',
] as const

export interface DocumentWithMatter extends DocumentRow {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  uploaded_by_profile: Pick<Profile, 'id' | 'full_name'> | null
}

export interface DocumentFilters {
  search?: string
  category?: string | 'all'
  matterId?: string | 'all'
}

const SELECT = '*, matter:matters(id, title, matter_number), uploaded_by_profile:profiles!documents_uploaded_by_fkey(id, full_name)'

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120)
}

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

const PAGE_SIZE = 200

export const documentsService = {
  /** One page of documents, newest first. A firm migrating decades of
   * records can easily clear Postgres/PostgREST's default row cap
   * (~1000) — without paging, the list would silently show only a partial,
   * arbitrary subset with no indication anything was cut off. */
  async list(organizationId: string, filters: DocumentFilters = {}, page = 0): Promise<{ rows: DocumentWithMatter[]; hasMore: boolean }> {
    let q = supabase
      .from('documents')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category)
    if (filters.matterId && filters.matterId !== 'all') q = q.eq('matter_id', filters.matterId)
    if (filters.search?.trim()) q = q.ilike('display_name', `%${filters.search.trim()}%`)
    // One extra row beyond PAGE_SIZE to detect "more" without a second count query.
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as unknown as DocumentWithMatter[]
    return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
  },

  /** Every matching document, regardless of volume — pages through
   * internally in batches so a large export never silently truncates at
   * PostgREST's default row cap. Only for export/reporting, never for
   * populating the on-screen list (that stays paginated via list() above). */
  async listAll(organizationId: string, filters: DocumentFilters = {}): Promise<DocumentWithMatter[]> {
    const all: DocumentWithMatter[] = []
    let page = 0
    for (;;) {
      const { rows, hasMore } = await this.list(organizationId, filters, page)
      all.push(...rows)
      if (!hasMore) break
      page += 1
    }
    return all
  },

  /** Every distinct category actually in use, so custom categories someone
   * typed once show up as suggestions/filters afterward instead of vanishing. */
  async listCategories(organizationId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('category')
      .eq('organization_id', organizationId)
      .not('category', 'is', null)
    if (error) throw error
    const values = (data ?? []).map((r) => r.category).filter((c): c is string => Boolean(c?.trim()))
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  },

  async upload(params: {
    organizationId: string
    file: File
    uploadedBy: string | null
    matterId?: string | null
    category?: string | null
    displayName?: string
  }): Promise<void> {
    const { organizationId, file, uploadedBy, matterId, category, displayName } = params

    // Fail fast before spending an actual upload round-trip — the DB
    // trigger (migration 0108) remains the authoritative, race-safe
    // enforcement regardless of what this optimistic check decides.
    const availability = await storageQuotaService.checkAvailability(organizationId, file.size)
    if (!availability.allowed) {
      throw new Error(storageLimitMessage(availability.usedBytes, availability.limitBytes, formatStorage))
    }

    const folder = matterId || 'general'
    const path = `${organizationId}/${folder}/${crypto.randomUUID()}-${sanitize(file.name)}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) throw upErr

    const { data, error } = await supabase
      .from('documents')
      .insert({
        organization_id: organizationId,
        matter_id: matterId || null,
        name: file.name,
        display_name: (displayName?.trim() || stripExtension(file.name)).slice(0, 200),
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        category: category || null,
        uploaded_by: uploadedBy,
      })
      .select('id')
      .single()
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      throw error
    }
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'document.uploaded',
      p_entity_type: 'document',
      p_entity_id: data.id,
      p_summary: `Uploaded ${file.name}`,
    })
  },

  async update(doc: DocumentRow, patch: { display_name?: string; category?: string | null }): Promise<void> {
    const { error } = await supabase.from('documents').update(patch).eq('id', doc.id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: doc.organization_id,
      p_action: 'document.renamed',
      p_entity_type: 'document',
      p_entity_id: doc.id,
      p_summary: patch.display_name ? `Renamed to ${patch.display_name}` : `Updated ${doc.display_name}`,
    })
  },

  async signedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
    if (error) throw error
    return data.signedUrl
  },

  async remove(doc: DocumentRow): Promise<void> {
    await supabase.storage.from(BUCKET).remove([doc.storage_path])
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: doc.organization_id,
      p_action: 'document.deleted',
      p_entity_type: 'document',
      p_entity_id: doc.id,
      p_summary: `Deleted ${doc.display_name}`,
    })
  },
}
