import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hrService } from '@/features/hr/services/hr.service'
import type { StaffProfileRow } from '@/features/hr/types'

export function useEmployees(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'employees', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listEmployees(organizationId!),
  })
}

export function useUpdateEmployeeProfile(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: Partial<StaffProfileRow> }) =>
      hrService.updateEmployeeProfile(organizationId!, userId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees', organizationId] }),
  })
}

export function useDepartments(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'departments', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listDepartments(organizationId!),
  })
}

export function useCreateDepartment(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => hrService.createDepartment(organizationId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'departments', organizationId] }),
  })
}

export function useDeleteDepartment(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'departments', organizationId] }),
  })
}

export function useJobTitles(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'job-titles', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listJobTitles(organizationId!),
  })
}

export function useCreateJobTitle(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => hrService.createJobTitle(organizationId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'job-titles', organizationId] }),
  })
}

export function useDeleteJobTitle(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteJobTitle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'job-titles', organizationId] }),
  })
}

export function useLeaveTypes(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'leave-types', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listLeaveTypes(organizationId!),
  })
}

export function useCreateLeaveType(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, days }: { name: string; days: number }) => hrService.createLeaveType(organizationId!, name, days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave-types', organizationId] }),
  })
}

export function useMyLeaveRequests(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-leave', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyLeaveRequests(organizationId!, userId!),
  })
}

export function useAllLeaveRequests(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'all-leave', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAllLeaveRequests(organizationId!),
  })
}

export function useMyLeaveBalances(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'leave-balances', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.myLeaveBalances(organizationId!, userId!),
  })
}

function useInvalidateLeave(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hr', 'my-leave', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'all-leave', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'leave-balances', organizationId] })
  }
}

export function useRequestLeave(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: ({ leaveTypeId, start, end, reason }: { leaveTypeId: string; start: string; end: string; reason?: string }) =>
      hrService.requestLeave(organizationId!, leaveTypeId, start, end, reason),
    onSuccess: invalidate,
  })
}

export function useReviewLeaveRequest(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: ({ id, approve, comment }: { id: string; approve: boolean; comment?: string }) =>
      hrService.reviewLeaveRequest(id, approve, comment),
    onSuccess: invalidate,
  })
}

export function useCancelLeaveRequest(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: (id: string) => hrService.cancelLeaveRequest(id),
    onSuccess: invalidate,
  })
}

export function useMyHrRequests(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-requests', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyHrRequests(organizationId!, userId!),
  })
}

export function useAllHrRequests(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'all-requests', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAllHrRequests(organizationId!),
  })
}

function useInvalidateHrRequests(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hr', 'my-requests', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'all-requests', organizationId] })
  }
}

export function useSubmitHrRequest(organizationId: string | null, userId: string | null) {
  const invalidate = useInvalidateHrRequests(organizationId)
  return useMutation({
    mutationFn: ({ requestType, subject, details }: { requestType: string; subject: string; details?: string }) =>
      hrService.submitHrRequest(organizationId!, userId!, requestType, subject, details),
    onSuccess: invalidate,
  })
}

export function useUpdateHrRequestStatus(organizationId: string | null) {
  const invalidate = useInvalidateHrRequests(organizationId)
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      hrService.updateHrRequestStatus(id, status, note),
    onSuccess: invalidate,
  })
}

export function useMyHrDocuments(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-documents', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyHrDocuments(organizationId!, userId!),
  })
}

export function useEmployeeHrDocuments(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'employee-documents', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listEmployeeHrDocuments(organizationId!, userId!),
  })
}

export function useUploadHrDocument(organizationId: string | null, uploadedBy: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { userId: string; file: File; category: string }) =>
      hrService.uploadHrDocument({ organizationId: organizationId!, uploadedBy, ...params }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'employee-documents', organizationId, vars.userId] })
      qc.invalidateQueries({ queryKey: ['hr', 'my-documents', organizationId, vars.userId] })
    },
  })
}

export function useDeleteHrDocument(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, storagePath }: { id: string; storagePath: string; userId: string }) => hrService.deleteHrDocument(id, storagePath),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'employee-documents', organizationId, vars.userId] })
      qc.invalidateQueries({ queryKey: ['hr', 'my-documents', organizationId, vars.userId] })
    },
  })
}

export function useOnboardingTemplates(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'onboarding-templates', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listOnboardingTemplates(organizationId!),
  })
}

export function useCreateOnboardingTemplate(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: import('@/features/hr/types').OnboardingItem[] }) =>
      hrService.createOnboardingTemplate(organizationId!, name, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'onboarding-templates', organizationId] }),
  })
}

export function useAssignOnboarding(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, templateId }: { userId: string; templateId: string }) =>
      hrService.assignOnboarding(organizationId!, userId, templateId),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['hr', 'onboarding-progress', organizationId, vars.userId] }),
  })
}

export function useEmployeeOnboardingProgress(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'onboarding-progress', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.getEmployeeOnboardingProgress(organizationId!, userId!),
  })
}

export function useAnnouncements(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'announcements', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAnnouncements(organizationId!),
  })
}

export function useSendAnnouncement(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { title: string; body: string; audienceType: string; departmentId?: string; userIds?: string[]; branch?: string; roleKey?: string }) =>
      hrService.sendAnnouncement({ organizationId: organizationId!, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements', organizationId] }),
  })
}
