import type { ComponentType } from 'react'
import { LayoutGrid, UserSquare2, CalendarClock, FolderLock, Inbox, Megaphone, FileBarChart, ClipboardCheck, type LucideIcon } from 'lucide-react'
import type { PermissionKey } from '@/shared/lib/permissions'
import { LeaveNavBadge } from '@/features/hr/components/leave-nav-badge'

export interface HrNavItem {
  label: string
  to: string
  icon: LucideIcon
  permission?: PermissionKey
  end?: boolean
  /** Rendered inline after the label, e.g. an unread-count pill. */
  badge?: ComponentType
}

export interface HrNavSection {
  heading?: string
  items: HrNavItem[]
}

/** The HR workspace's own navigation — deliberately separate from the
 * firm's practice-area NAVIGATION (matters, clients, billing, etc. never
 * appear here). Reached via "HR Workspace" in the profile menu, not from
 * the main sidebar. */
export const HR_NAVIGATION: HrNavSection[] = [
  {
    items: [
      { label: 'Dashboard', to: '/hr', icon: LayoutGrid, permission: 'hr.view_reports', end: true },
      { label: 'Employees', to: '/hr/employees', icon: UserSquare2, permission: 'staff.manage' },
      { label: 'Onboarding', to: '/hr/onboarding', icon: ClipboardCheck, permission: 'onboarding.manage' },
      { label: 'Leave', to: '/hr/leave', icon: CalendarClock, permission: 'leave.request', badge: LeaveNavBadge },
      { label: 'Documents', to: '/hr/documents', icon: FolderLock, permission: 'hr_documents.view_own' },
      { label: 'HR Requests', to: '/hr/requests', icon: Inbox, permission: 'hr_requests.submit' },
      { label: 'Announcements', to: '/hr/announcements', icon: Megaphone, permission: 'hr_announcements.view' },
      { label: 'HR Reports', to: '/hr/reports', icon: FileBarChart, permission: 'hr.view_reports' },
    ],
  },
]
