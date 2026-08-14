import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Database } from '@/shared/types/database.types'

export type StaffProfileRow = Database['public']['Tables']['staff_profiles']['Row']
export type Department = Database['public']['Tables']['departments']['Row']
export type JobTitle = Database['public']['Tables']['job_titles']['Row']
export type LeaveType = Database['public']['Tables']['leave_types']['Row']
export type LeaveBalanceRow = Database['public']['Tables']['leave_balances']['Row']
export type LeaveRequestRow = Database['public']['Tables']['leave_requests']['Row']
export type HrRequestRow = Database['public']['Tables']['hr_requests']['Row']
export type HrDocumentRow = Database['public']['Tables']['hr_employee_documents']['Row']
export type OnboardingTemplate = Database['public']['Tables']['onboarding_templates']['Row']
export type EmployeeOnboardingRow = Database['public']['Tables']['employee_onboarding']['Row']
export type HrAnnouncementRow = Database['public']['Tables']['hr_announcements']['Row']

export interface OnboardingItem {
  label: string
  assignee: 'employee' | 'manager' | 'hr'
}

export interface LeaveSummaryRow {
  leaveTypeId: string
  name: string
  limit: number
  taken: number
  balance: number
}

export interface OnboardingProgress {
  onboarding: EmployeeOnboardingRow
  templateName: string
  total: number
  done: number
}

/** One row per active member — merges the membership/profile/role data
 * every firm already has with the HR fields on staff_profiles (which may
 * not exist yet for someone HR hasn't filled in). */
export interface Employee {
  userId: string
  fullName: string | null
  email: string
  avatarUrl: string | null
  roleName: string | null
  membershipStatus: string
  profile: StaffProfileRow | null
  departmentName: string | null
  jobTitleName: string | null
  managerName: string | null
}

export const EMPLOYMENT_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  applicant: { label: 'Applicant', variant: 'muted' },
  onboarding: { label: 'Onboarding', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
  on_leave: { label: 'On Leave', variant: 'warning' },
  suspended: { label: 'Suspended', variant: 'destructive' },
  resigned: { label: 'Resigned', variant: 'muted' },
  terminated: { label: 'Terminated', variant: 'destructive' },
  former_employee: { label: 'Former Employee', variant: 'muted' },
}

export const EMPLOYMENT_STATUSES = Object.keys(EMPLOYMENT_STATUS_META)

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
]

export const LEAVE_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
}

export const HR_REQUEST_TYPES = [
  { value: 'employment_letter', label: 'Employment letter' },
  { value: 'salary_certificate', label: 'Salary certificate' },
  { value: 'personal_info_change', label: 'Personal information change' },
  { value: 'hr_document_request', label: 'HR document request' },
  { value: 'equipment_request', label: 'Equipment request' },
  { value: 'workplace_issue', label: 'Workplace issue' },
  { value: 'other', label: 'Other' },
]

export const HR_REQUEST_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  submitted: { label: 'Submitted', variant: 'warning' },
  in_review: { label: 'In review', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'default' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  completed: { label: 'Completed', variant: 'success' },
}

export const ANNOUNCEMENT_AUDIENCES = [
  { value: 'organization', label: 'Entire organization' },
  { value: 'role', label: 'Everyone with a specific role' },
  { value: 'department', label: 'A department' },
  { value: 'employees', label: 'Specific employees' },
  { value: 'branch', label: 'A branch/location' },
]

export const HR_DOCUMENT_CATEGORIES = [
  { value: 'employment_contract', label: 'Employment Contract' },
  { value: 'identification', label: 'Identification' },
  { value: 'professional_certificate', label: 'Professional Certificate' },
  { value: 'bar_certificate', label: 'Bar Certificate' },
  { value: 'nda', label: 'NDA' },
  { value: 'policy_acknowledgement', label: 'Policy Acknowledgement' },
  { value: 'performance_review', label: 'Performance Review' },
  { value: 'warning_letter', label: 'Warning Letter' },
  { value: 'employment_letter', label: 'Employment Letter' },
  { value: 'other', label: 'Other' },
]
