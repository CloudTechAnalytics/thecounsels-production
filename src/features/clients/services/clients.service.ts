import { supabase } from '@/shared/lib/supabase'
import type { Client, ClientContact, ClientStatus, ClientType } from '@/shared/types/database.types'
import { clientDisplayName, type ClientFormValues, type ContactFormValues } from '@/features/clients/schemas'

export interface ClientFilters {
  search?: string
  type?: ClientType | 'all'
  status?: ClientStatus | 'all'
}

/** A client row plus how many contacts it has, for the list's badge —
 * one query, no N+1. */
export interface ClientRow extends Client {
  contacts: { count: number }[]
}

export interface DuplicateMatch {
  id: string
  display_name: string
  type: ClientType
  match_type: 'exact' | 'similar'
  score: number
}

function toRow(values: ClientFormValues) {
  return {
    type: values.type,
    display_name: clientDisplayName(values),
    first_name: values.firstName?.trim() || null,
    last_name: values.lastName?.trim() || null,
    company_name: values.companyName?.trim() || null,
    registration_number: values.registrationNumber?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
    website: values.website?.trim() || null,
    address: values.address?.trim() || null,
    city: values.city?.trim() || null,
    country: values.country?.trim() || null,
    status: values.status,
    notes: values.notes?.trim() || null,
  }
}

export const clientsService = {
  async list(organizationId: string, filters: ClientFilters = {}): Promise<ClientRow[]> {
    let q = supabase
      .from('clients')
      .select('*, contacts:client_contacts(count)')
      .eq('organization_id', organizationId)
      .order('display_name', { ascending: true })

    if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      // Scoped to client-level fields — per-contact name/email isn't searched here.
      q = q.or(`display_name.ilike.${s},email.ilike.${s},company_name.ilike.${s},registration_number.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as ClientRow[]
  },

  /** Exact/similar matches against existing clients, checked before create. */
  async checkDuplicates(
    organizationId: string,
    params: { name: string; email?: string; phone?: string; registrationNumber?: string; excludeId?: string },
  ): Promise<DuplicateMatch[]> {
    const { data, error } = await supabase.rpc('find_similar_clients', {
      p_org: organizationId,
      p_name: params.name,
      p_email: params.email?.trim() || null,
      p_phone: params.phone?.trim() || null,
      p_registration_number: params.registrationNumber?.trim() || null,
      p_exclude_id: params.excludeId ?? null,
    })
    if (error) throw error
    return (data ?? []) as DuplicateMatch[]
  },

  async create(organizationId: string, values: ClientFormValues, createdBy: string | null): Promise<Client> {
    const { data, error } = await supabase
      .from('clients')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select('*')
      .single()
    if (error) throw error

    // One inline contact, if provided — same fields the old single-contact
    // form collected, now written to client_contacts instead of flat columns.
    if (values.contactName?.trim()) {
      await supabase.from('client_contacts').insert({
        organization_id: organizationId,
        client_id: data.id,
        name: values.contactName.trim(),
        title: values.contactTitle?.trim() || null,
        email: values.contactEmail?.trim() || null,
        phone: values.contactPhone?.trim() || null,
        is_primary: true,
      })
    }

    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.created',
      p_entity_type: 'client',
      p_entity_id: data.id,
      p_summary: `Added client ${data.display_name}`,
    })
    return data
  },

  async update(id: string, organizationId: string, values: ClientFormValues): Promise<Client> {
    const { data, error } = await supabase.from('clients').update(toRow(values)).eq('id', id).select('*').single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.updated',
      p_entity_type: 'client',
      p_entity_id: id,
      p_summary: `Updated client ${data.display_name}`,
    })
    return data
  },

  /** Matters attached to this client — used to warn before a delete that
   * now cascades (migration 0037). */
  async countMatters(clientId: string): Promise<number> {
    const { count, error } = await supabase
      .from('matters')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
    if (error) throw error
    return count ?? 0
  },

  async remove(id: string, organizationId: string, name: string, matterCount = 0): Promise<void> {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.deleted',
      p_entity_type: 'client',
      p_entity_id: id,
      p_summary:
        matterCount > 0
          ? `Deleted client ${name} (cascaded ${matterCount} matter${matterCount === 1 ? '' : 's'})`
          : `Deleted client ${name}`,
    })
  },

  // Contacts -------------------------------------------------------------
  async listContacts(clientId: string): Promise<ClientContact[]> {
    const { data, error } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async addContact(organizationId: string, clientId: string, values: ContactFormValues): Promise<void> {
    const { error } = await supabase.from('client_contacts').insert({
      organization_id: organizationId,
      client_id: clientId,
      name: values.name.trim(),
      title: values.title?.trim() || null,
      email: values.email?.trim() || null,
      phone: values.phone?.trim() || null,
    })
    if (error) throw error
  },

  async setPrimaryContact(clientId: string, contactId: string): Promise<void> {
    // Unique partial index allows only one primary per client — clear the
    // current one first so the swap doesn't collide with it.
    const { error: e1 } = await supabase
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true)
    if (e1) throw e1
    const { error: e2 } = await supabase.from('client_contacts').update({ is_primary: true }).eq('id', contactId)
    if (e2) throw e2
  },

  async removeContact(id: string): Promise<void> {
    const { error } = await supabase.from('client_contacts').delete().eq('id', id)
    if (error) throw error
  },
}
