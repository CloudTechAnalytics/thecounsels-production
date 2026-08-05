import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsService, type ClientFilters } from '@/features/clients/services/clients.service'
import type { ClientFormValues, ContactFormValues } from '@/features/clients/schemas'

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

/** Matters attached to a client — used to warn before a delete that cascades. */
export function useClientMatterCount(clientId: string | undefined) {
  return useQuery({
    queryKey: ['clients', 'matter-count', clientId],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.countMatters(clientId!),
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, matterCount }: { id: string; name: string; matterCount?: number }) =>
      clientsService.remove(id, organizationId!, name, matterCount),
    onSuccess: () => {
      invalidate()
      // A cascaded delete can remove matters — refresh every surface that lists them.
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['matter'] })
    },
  })
}

/** Checked on submit, not automatically — call `.mutateAsync(...)` from the
 * form and inspect the returned matches before deciding whether to proceed. */
export function useCheckClientDuplicates(organizationId: string | null) {
  return useMutation({
    mutationFn: (params: { name: string; email?: string; phone?: string; registrationNumber?: string; excludeId?: string }) =>
      clientsService.checkDuplicates(organizationId!, params),
  })
}

// Contacts ----------------------------------------------------------------
export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ['clients', 'contacts', clientId],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listContacts(clientId!),
  })
}

function useInvalidateContacts(organizationId: string | null, clientId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['clients', 'contacts', clientId] })
    qc.invalidateQueries({ queryKey: ['clients', organizationId ?? 'none'] })
  }
}

export function useAddContact(organizationId: string | null, clientId: string | undefined) {
  const invalidate = useInvalidateContacts(organizationId, clientId)
  return useMutation({
    mutationFn: (values: ContactFormValues) => clientsService.addContact(organizationId!, clientId!, values),
    onSuccess: invalidate,
  })
}

export function useSetPrimaryContact(organizationId: string | null, clientId: string | undefined) {
  const invalidate = useInvalidateContacts(organizationId, clientId)
  return useMutation({
    mutationFn: (contactId: string) => clientsService.setPrimaryContact(clientId!, contactId),
    onSuccess: invalidate,
  })
}

export function useRemoveContact(organizationId: string | null, clientId: string | undefined) {
  const invalidate = useInvalidateContacts(organizationId, clientId)
  return useMutation({
    mutationFn: (contactId: string) => clientsService.removeContact(contactId),
    onSuccess: invalidate,
  })
}
