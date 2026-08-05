import { supabase } from '@/shared/lib/supabase'
import type { Client, ClientStatus, ClientType } from '@/shared/types/database.types'
import { clientDisplayName, type ClientFormValues } from '@/features/clients/schemas'

export interface ClientFilters {
  search?: string
  type?: ClientType | 'all'
  status?: ClientStatus | 'all'
}

function toRow(values: ClientFormValues) {
  return {
    type: values.type,
    display_name: clientDisplayName(values),
    first_name: values.firstName?.trim() || null,
    last_name: values.lastName?.trim() || null,
    company_name: values.companyName?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
    contact_name: values.contactName?.trim() || null,
    contact_title: values.contactTitle?.trim() || null,
    contact_email: values.contactEmail?.trim() || null,
    contact_phone: values.contactPhone?.trim() || null,
    website: values.website?.trim() || null,
    address: values.address?.trim() || null,
    city: values.city?.trim() || null,
    country: values.country?.trim() || null,
    status: values.status,
    notes: values.notes?.trim() || null,
  }
}

export const clientsService = {
  async list(organizationId: string, filters: ClientFilters = {}): Promise<Client[]> {
    let q = supabase
      .from('clients')
      .select('*')
      .eq('organization_id', organizationId)
      .order('display_name', { ascending: true })

    if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      q = q.or(`display_name.ilike.${s},email.ilike.${s},company_name.ilike.${s},contact_name.ilike.${s},contact_email.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async create(organizationId: string, values: ClientFormValues, createdBy: string | null): Promise<Client> {
    const { data, error } = await supabase
      .from('clients')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select('*')
      .single()
    if (error) throw error
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
}
