import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FolderOpen,
  Gavel,
  CalendarDays,
  CalendarClock,
  CheckSquare,
  Receipt,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { PermissionKey } from '@/shared/lib/permissions'
import type { PlanFeatureKey } from '@/features/administration/lib/plan-features'
import { MessagesNavBadge } from '@/features/messaging/components/messages-nav-badge'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Any of these permissions grants visibility. */
  permission?: PermissionKey | PermissionKey[]
  /** Additionally requires the org's plan to include this feature. */
  planFeature?: PlanFeatureKey
  end?: boolean
  /** Rendered inline after the label, e.g. an unread-count pill. */
  badge?: ComponentType
}

export interface NavSection {
  heading?: string
  items: NavItem[]
}

/** Primary navigation for the firm's practice workspace. HR lives in its
 * own separate shell (see src/features/hr/navigation.ts + HrLayout),
 * reached via "HR Workspace" in the profile menu — not listed here. */
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
      { label: 'Appointments', to: '/appointments', icon: CalendarClock, permission: 'appointments.view', planFeature: 'appointments' },
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
      { label: 'Messages', to: '/messages', icon: MessageSquare, permission: 'messaging.view', planFeature: 'messaging', badge: MessagesNavBadge },
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
