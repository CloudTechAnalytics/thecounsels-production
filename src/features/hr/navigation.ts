import type { ComponentType } from 'react'
import { LayoutGrid, UserSquare2, CalendarClock, FolderLock, Inbox, Megaphone, FileBarChart, ClipboardCheck, Wallet, Banknote, ReceiptText, ListChecks, Settings2, Scale, type LucideIcon, Network, Package, Zap, ClipboardList, Star } from 'lucide-react'
import type { PermissionKey } from '@/shared/lib/permissions'
import type { PlanFeatureKey } from '@/features/administration/lib/plan-features'
import { LeaveNavBadge } from '@/features/hr/components/leave-nav-badge'
import { AnnouncementsNavBadge } from '@/features/hr/components/announcements-nav-badge'

export interface HrNavItem {
  label: string
  to: string
  icon: LucideIcon
  /** One key, or several where holding any one of them is enough. */
  permission?: PermissionKey | PermissionKey[]
  end?: boolean
  /** Hidden unless the firm's plan includes this feature. */
  planFeature?: PlanFeatureKey
  /** Rendered inline after the label, e.g. an unread-count pill. */
  badge?: ComponentType
}

export interface HrNavSection {
  heading?: string
  items: HrNavItem[]
}

/** The HR & Finance workspace's own navigation — deliberately separate
 * from the firm's practice-area NAVIGATION (matters, clients, billing,
 * etc. never appear here). Reached via "HR & Finance" in the profile menu,
 * not from the main sidebar. */
export const HR_NAVIGATION: HrNavSection[] = [
  {
    items: [
      { label: 'HR Dashboard', to: '/hr', icon: LayoutGrid, permission: 'hr.view_reports', end: true },
      { label: 'Approval Centre', to: '/hr/approvals', icon: ListChecks, permission: ['funds.approve', 'funds.manage', 'leave.manage', 'hr_requests.manage'], planFeature: 'fund_requests' },
    ],
  },
  {
    heading: 'People',
    items: [
      { label: 'Employees', to: '/hr/employees', icon: UserSquare2, permission: 'staff.manage' },
      { label: 'Reporting Lines', to: '/hr/team-structure', icon: Network, permission: ['staff.manage', 'departments.manage'] },
      { label: 'Onboarding', to: '/hr/onboarding', icon: ClipboardCheck, permission: 'onboarding.view_own' },
      { label: 'Leave Management', to: '/hr/leave', icon: CalendarClock, permission: 'leave.request', badge: LeaveNavBadge },
      { label: 'Appraisals', to: '/hr/appraisals', icon: Star, permission: 'leave.request', planFeature: 'appraisals' },
      { label: 'Documents', to: '/hr/documents', icon: FolderLock, permission: 'hr_documents.view_own' },
      { label: 'HR Requests', to: '/hr/requests', icon: Inbox, permission: 'hr_requests.submit' },
      { label: 'Circulars', to: '/hr/announcements', icon: Megaphone, permission: 'hr_announcements.view', badge: AnnouncementsNavBadge, planFeature: 'circulars' },
      { label: 'Surveys', to: '/hr/surveys', icon: ClipboardList, permission: 'leave.request', planFeature: 'surveys' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Fund Requests', to: '/hr/funds', icon: Wallet, permission: 'funds.request', planFeature: 'fund_requests' },
      { label: 'Expense Retirement', to: '/hr/retirements', icon: Scale, permission: 'funds.request', planFeature: 'fund_requests' },
      { label: 'Payroll', to: '/hr/payroll', icon: Banknote, permission: 'payroll.manage', planFeature: 'payroll' },
      { label: 'Payslips', to: '/hr/payslips', icon: ReceiptText, permission: 'payroll.view_own', planFeature: 'payroll' },
    ],
  },
  {
    heading: 'Office',
    items: [
      { label: 'Inventory', to: '/hr/inventory', icon: Package, permission: 'leave.request', planFeature: 'inventory' },
      { label: 'Electricity & Power', to: '/hr/power', icon: Zap, permission: 'power.manage', planFeature: 'power_management' },
    ],
  },
  {
    heading: 'Reports & setup',
    items: [
      { label: 'HR & Finance Reports', to: '/hr/reports', icon: FileBarChart, permission: 'hr.view_reports' },
      { label: 'Settings', to: '/hr/settings', icon: Settings2, permission: ['funds.approve', 'funds.manage', 'departments.manage', 'staff.manage', 'payroll.manage'] },
    ],
  },
]
