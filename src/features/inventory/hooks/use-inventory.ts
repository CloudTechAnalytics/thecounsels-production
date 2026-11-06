import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.types'

export type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
export type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row']
export type InventoryRequest = Database['public']['Tables']['inventory_requests']['Row'] & { requester_name?: string | null }
export type InventoryItemInput = Database['public']['Tables']['inventory_items']['Update']

export const ASSET_CATEGORIES = ['IT equipment', 'Phones', 'Furniture', 'Office equipment', 'Vehicles', 'Power & generators', 'Other'] as const
export const SUPPLY_CATEGORIES = ['Stationery', 'Printing', 'Files & folders', 'Kitchen & cleaning', 'Court supplies', 'Other'] as const
export const ASSET_STATUS_META: Record<InventoryItem['status'], { label: string; variant: 'success' | 'default' | 'warning' | 'muted' | 'destructive' }> = {
  in_store: { label: 'In store', variant: 'muted' },
  assigned: { label: 'Assigned', variant: 'success' },
  repair: { label: 'Under repair', variant: 'warning' },
  disposed: { label: 'Disposed', variant: 'muted' },
  lost: { label: 'Lost', variant: 'destructive' },
}
export const REQUEST_STATUS_META: Record<InventoryRequest['status'], { label: string; variant: 'success' | 'default' | 'warning' | 'muted' | 'destructive' }> = {
  pending: { label: 'Awaiting approval', variant: 'warning' },
  approved: { label: 'Approved · to issue', variant: 'default' },
  rejected: { label: 'Declined', variant: 'destructive' },
  issued: { label: 'Issued', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
}
export const MOVEMENT_LABEL: Record<string, string> = {
  received: 'Received', issued: 'Issued', returned: 'Returned', adjusted: 'Stock count', assigned: 'Assigned',
  unassigned: 'Returned', repair: 'Sent for repair', disposed: 'Disposed', lost: 'Marked lost', moved: 'Moved',
}
export const isLowStock = (i: InventoryItem) => i.kind === 'supply' && i.reorder_level != null && Number(i.quantity) <= Number(i.reorder_level)

const key = (org: string | null) => ['inventory', org] as const

export function useInventoryItems(organizationId: string | null) {
  return useQuery({
    queryKey: [...key(organizationId), 'items'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_items').select('*').eq('organization_id', organizationId!).order('name')
      if (error) throw error
      return (data ?? []) as InventoryItem[]
    },
  })
}

export function useInventoryItem(id: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'item', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_items').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as InventoryItem | null
    },
  })
}

export function useInventoryMovements(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'movements', itemId],
    enabled: Boolean(itemId),
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_movements').select('*').eq('item_id', itemId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InventoryMovement[]
    },
  })
}

export function useInventoryRequests(organizationId: string | null) {
  return useQuery({
    queryKey: [...key(organizationId), 'requests'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_requests')
        .select('*, requester:profiles!inventory_requests_user_id_fkey(full_name)')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as (InventoryRequest & { requester: { full_name: string | null } | null })[])
        .map(({ requester, ...r }) => ({ ...r, requester_name: requester?.full_name ?? null }))
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['inventory'] })
}

export function useSaveInventoryItem(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, kind, ...v }: InventoryItemInput & { id?: string; kind: 'asset' | 'supply'; name: string }): Promise<string> => {
      if (id) {
        const { error } = await supabase.from('inventory_items').update(v).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('inventory_items').insert({ ...v, kind, organization_id: organizationId! }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteInventoryItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useInventoryMove() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { item: string; kind: string; quantity?: number | null; employee?: string | null; note?: string; unitCost?: number | null; condition?: string | null }) => {
      const { error } = await supabase.rpc('inventory_move', {
        p_item: v.item, p_kind: v.kind, p_quantity: v.quantity ?? null, p_employee: v.employee ?? null,
        p_note: v.note || null, p_unit_cost: v.unitCost ?? null, p_condition: v.condition ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAcknowledgeAsset() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (item: string) => {
      const { error } = await supabase.rpc('acknowledge_asset', { p_item: item })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRequestInventory(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { item?: string | null; name?: string; quantity: number; reason?: string }) => {
      const { error } = await supabase.rpc('request_inventory', {
        p_org: organizationId!, p_item: v.item ?? null, p_item_name: v.name || null, p_quantity: v.quantity, p_reason: v.reason || null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDecideInventoryRequest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean; note?: string }) => {
      const { error } = await supabase.rpc('decide_inventory_request', { p_id: v.id, p_approve: v.approve, p_note: v.note || null })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useIssueInventoryRequest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; item?: string | null }) => {
      const { error } = await supabase.rpc('issue_inventory_request', { p_id: v.id, p_item: v.item ?? null })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCancelInventoryRequest() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_inventory_request', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
