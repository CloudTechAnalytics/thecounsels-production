import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { employeesService, type EmployeeInput, type EmployeeRecord } from '@/features/hr/services/employees.service'

export function useEmployeeRegister(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'register', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => employeesService.listRegister(organizationId!),
  })
}

function useInvalidateEmployees(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hr', 'register', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'employees', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'departments', organizationId] })
    qc.invalidateQueries({ queryKey: ['payroll', 'employees', organizationId] })
    qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
  }
}

export function useCreateEmployee(organizationId: string | null) {
  const invalidate = useInvalidateEmployees(organizationId)
  return useMutation({
    mutationFn: (input: EmployeeInput & { first_name: string }) => employeesService.createEmployee(organizationId!, input),
    onSuccess: invalidate,
  })
}

export function useUpdateEmployee(organizationId: string | null) {
  const invalidate = useInvalidateEmployees(organizationId)
  return useMutation({
    mutationFn: ({ employee, patch }: { employee: EmployeeRecord; patch: EmployeeInput }) =>
      employeesService.updateEmployee(organizationId!, employee, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteEmployee(organizationId: string | null) {
  const invalidate = useInvalidateEmployees(organizationId)
  return useMutation({
    mutationFn: (employee: EmployeeRecord) => employeesService.deleteEmployee(organizationId!, employee),
    onSuccess: invalidate,
  })
}

export function useSetDepartmentHead(organizationId: string | null) {
  const invalidate = useInvalidateEmployees(organizationId)
  return useMutation({
    mutationFn: ({ departmentId, employeeId }: { departmentId: string; employeeId: string | null }) =>
      employeesService.setDepartmentHead(departmentId, employeeId),
    onSuccess: invalidate,
  })
}
