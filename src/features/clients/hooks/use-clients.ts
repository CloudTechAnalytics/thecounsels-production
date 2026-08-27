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

/** retry: false — same reasoning as useMatter()/useTask(): don't keep
 * retrying a fetch that failed because access was revoked. */
export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['client', id],
    enabled: Boolean(id),
    queryFn: () => clientsService.get(id!),
    retry: false,
  })
}

export function useClientInvoices(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'invoices'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listInvoices(clientId!),
  })
}

export function useClientPayments(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'payments'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listPayments(clientId!),
  })
}

export function useClientDocuments(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'documents'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listDocuments(clientId!),
  })
}

export function useClientTasks(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'tasks'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listTasks(clientId!),
  })
}

export function useClientHearings(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'hearings'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listHearings(clientId!),
  })
}

export function useClientExpenses(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'expenses'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listExpenses(clientId!),
  })
}

export function useClientActivity(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'activity'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listActivity(clientId!),
  })
}

export function useClientCommunications(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId, 'communications'],
    enabled: Boolean(clientId),
    queryFn: () => clientsService.listCommunications(clientId!),
  })
}

export function useMatterCommunications(matterId: string | undefined) {
  return useQuery({
    queryKey: ['matter', matterId, 'communications'],
    enabled: Boolean(matterId),
    queryFn: () => clientsService.listMatterCommunications(matterId!),
  })
}

export function useSendCommunication(organizationId: string | null, clientId: string | undefined, matterId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      matterId?: string | null
      sentBy: string | null
      recipientName?: string | null
      recipientEmail: string
      subject: string
      body: string
    }) => clientsService.sendCommunication({ organizationId: organizationId!, clientId: clientId!, ...params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', clientId, 'communications'] })
      qc.invalidateQueries({ queryKey: ['client', clientId, 'activity'] })
      if (matterId) {
        qc.invalidateQueries({ queryKey: ['matter', matterId, 'communications'] })
        qc.invalidateQueries({ queryKey: ['matter-events', matterId] })
      }
    },
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
