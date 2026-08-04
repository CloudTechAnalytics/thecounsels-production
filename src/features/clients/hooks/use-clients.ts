import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsService, type ClientFilters } from '@/features/clients/services/clients.service'
import type { ClientFormValues } from '@/features/clients/schemas'

const keys = {
  list: (orgId: string, filters: ClientFilters) => ['clients', orgId, filters] as const,
}

export function useClients(organizationId: string | null, filters: ClientFilters) {
  return useQuery({
    queryKey: keys.list(organizationId ?? 'none', filters),
    enabled: Boolean(organizationId),
    queryFn: () => clientsService.list(organizationId!, filters),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['clients', organizationId ?? 'none'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
}

export function useCreateClient(organizationId: string | null, createdBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: ClientFormValues) => clientsService.create(organizationId!, values, createdBy),
    onSuccess: invalidate,
  })
}

export function useUpdateClient(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ClientFormValues }) =>
      clientsService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useDeleteClient(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => clientsService.remove(id, organizationId!, name),
    onSuccess: invalidate,
  })
}
