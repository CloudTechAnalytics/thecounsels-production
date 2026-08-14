import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FolderOpen,
  Gavel,
  CalendarDays,
  CheckSquare,
  Receipt,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  LayoutGrid,
  UserSquare2,
  CalendarClock,
  Inbox,
  FolderLock,
  Megaphone,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react'
import type { PermissionKey } from '@/shared/lib/permissions'
import { MessagesNavBadge } from '@/features/messaging/components/messages-nav-badge'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Any of these permissions grants visibility. */
  permission?: PermissionKey | PermissionKey[]
  end?: boolean
  /** Rendered inline after the label, e.g. an unread-count pill. */
  badge?: ComponentType
}

export interface NavSection {
  heading?: string
  items: NavItem[]
}

/** Primary navigation. Items are filtered by the active org's permissions. */
export const NAVIGATION: NavSection[] = [
  {
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, permission: 'dashboard.view', end: true }],
  },
  {
    heading: 'Practice',
    items: [
      { label: 'Matters', to: '/matters', icon: Briefcase, permission: 'matters.view' },
      { label: 'Clients', to: '/clients', icon: Users, permission: 'clients.view' },
      { label: 'Documents', to: '/documents', icon: FolderOpen, permission: 'documents.view' },
      { label: 'Hearings', to: '/hearings', icon: Gavel, permission: 'hearings.view' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, permission: 'calendar.view' },
      { label: 'Tasks', to: '/tasks', icon: CheckSquare, permission: 'tasks.view' },
    ],
  },
  {
    heading: 'Firm',
    items: [
      { label: 'Lawyers & Staff', to: '/staff', icon: Users, permission: 'staff.view' },
      { label: 'Billing', to: '/billing', icon: Receipt, permission: 'billing.view' },
      { label: 'Reports', to: '/reports', icon: BarChart3, permission: 'reports.view' },
      { label: 'Notifications', to: '/notifications', icon: Bell, permission: 'notifications.view' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, permission: 'messaging.view', badge: MessagesNavBadge },
    ],
  },
  {
    heading: 'HR',
    items: [
      { label: 'Overview', to: '/hr', icon: LayoutGrid, permission: 'hr.view_reports', end: true },
      { label: 'Employees', to: '/hr/employees', icon: UserSquare2, permission: 'staff.view' },
      { label: 'Leave', to: '/hr/leave', icon: CalendarClock, permission: 'leave.request' },
      { label: 'Documents', to: '/hr/documents', icon: FolderLock, permission: 'hr_documents.view_own' },
      { label: 'HR Requests', to: '/hr/requests', icon: Inbox, permission: 'hr_requests.submit' },
      { label: 'Announcements', to: '/hr/announcements', icon: Megaphone, permission: 'hr_announcements.view' },
      { label: 'HR Reports', to: '/hr/reports', icon: FileBarChart, permission: 'hr.view_reports' },
    ],
  },
  {
    heading: 'Settings',
    items: [
      {
        label: 'Firm Settings',
        to: '/administration',
        icon: Settings,
        permission: ['organization.view', 'members.view'],
      },
    ],
  },
]
