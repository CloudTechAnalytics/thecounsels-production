import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.types'

export type PowerSource = Database['public']['Tables']['power_sources']['Row']
export type PowerLog = Database['public']['Tables']['power_logs']['Row']
export type PowerSourceKind = PowerSource['kind']
export type PowerLogKind = PowerLog['kind']
export type PowerSourceInput = Database['public']['Tables']['power_sources']['Update']

export const SOURCE_KIND_LABEL: Record<PowerSourceKind, string> = {
  grid: 'Grid meter', generator: 'Generator', solar: 'Solar', inverter: 'Inverter / batteries',
}

/** Which log types make sense for which source, and how each one is worded. */
export const LOG_META: Record<PowerLogKind, {
  label: string; for: PowerSourceKind[]; amount?: string; quantity?: string; reading?: string; vendor?: string; reference?: string; isCost: boolean
}> = {
  token: { label: 'Token purchase', for: ['grid'], amount: 'Amount paid', quantity: 'Units (kWh)', vendor: 'Bought from', reference: 'Token number', isCost: true },
  bill: { label: 'Electricity bill', for: ['grid'], amount: 'Bill amount', quantity: 'Units billed (kWh)', reference: 'Bill / account no.', isCost: true },
  fuel: { label: 'Fuel purchase', for: ['generator'], amount: 'Amount paid', quantity: 'Litres', vendor: 'Station / supplier', reference: 'Receipt no.', isCost: true },
  runtime: { label: 'Running hours', for: ['generator'], reading: 'Hour meter now', quantity: 'Or: hours run', isCost: false },
  service: { label: 'Service / repair', for: ['generator', 'solar', 'inverter', 'grid'], amount: 'Cost', reading: 'Hour meter at service', vendor: 'Technician / company', isCost: true },
  outage: { label: 'Power outage', for: ['grid'], quantity: 'Hours without power', isCost: false },
  reading: { label: 'Meter reading', for: ['grid', 'solar', 'inverter'], reading: 'Reading', isCost: false },
}

export const kindsFor = (k: PowerSourceKind) => (Object.keys(LOG_META) as PowerLogKind[]).filter((x) => LOG_META[x].for.includes(k))

/** Running hours since the last service, and whether it's due (≥ 90%). */
export function serviceStatus(s: PowerSource) {
  if (s.kind !== 'generator' || s.service_interval_hours == null || s.hour_meter == null) return null
  const since = Number(s.hour_meter) - Number(s.last_service_hours ?? 0)
  const pct = since / s.service_interval_hours
  return { since, interval: s.service_interval_hours, pct, due: pct >= 0.9, overdue: pct >= 1 }
}

export function usePowerSources(organizationId: string | null) {
  return useQuery({
    queryKey: ['power', organizationId, 'sources'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('power_sources').select('*').eq('organization_id', organizationId!).order('name')
      if (error) throw error
      return (data ?? []) as PowerSource[]
    },
  })
}

export function usePowerLogs(organizationId: string | null, since: string) {
  return useQuery({
    queryKey: ['power', organizationId, 'logs', since],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('power_logs').select('*').eq('organization_id', organizationId!)
        .gte('log_date', since).order('log_date', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PowerLog[]
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['power'] })
}

export function useSavePowerSource(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, ...v }: PowerSourceInput & { id?: string; kind: PowerSourceKind; name: string }) => {
      const { error } = id
        ? await supabase.from('power_sources').update(v).eq('id', id)
        : await supabase.from('power_sources').insert({ ...v, organization_id: organizationId! })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeletePowerSource() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('power_sources').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAddPowerLog(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: Omit<Database['public']['Tables']['power_logs']['Insert'], 'organization_id'>) => {
      const { error } = await supabase.from('power_logs').insert({ ...v, organization_id: organizationId! })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeletePowerLog() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('power_logs').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Only the person who logged it can delete it, within 7 days (or a partner).')
    },
    onSuccess: invalidate,
  })
}
