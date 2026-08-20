import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { appointmentsService, type AppointmentFilters } from '@/features/appointments/services/appointments.service'
import type { AppointmentFormValues } from '@/features/appointments/schemas'
import type { AppointmentStatus } from '@/shared/types/database.types'

export function useAppointments(organizationId: string | null, filters: AppointmentFilters = {}) {
  return useQuery({
    queryKey: ['appointments', organizationId, filters],
    enabled: Boolean(organizationId),
    queryFn: () => appointmentsService.list(organizationId!, filters),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['appointments', organizationId] })
    qc.invalidateQueries({ queryKey: ['matter-summary'] })
  }
}

export function useCreateAppointment(organizationId: string | null, createdBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: AppointmentFormValues) => appointmentsService.create(organizationId!, values, createdBy),
    onSuccess: invalidate,
  })
}

export function useUpdateAppointment(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: AppointmentFormValues }) =>
      appointmentsService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useSetAppointmentStatus(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, status, title }: { id: string; status: AppointmentStatus; title: string }) =>
      appointmentsService.setStatus(id, organizationId!, status, title),
    onSuccess: invalidate,
  })
}

export function useDeleteAppointment(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => appointmentsService.remove(id, organizationId!, title),
    onSuccess: invalidate,
  })
}
