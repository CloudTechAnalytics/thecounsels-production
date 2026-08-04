import {
  Briefcase,
  Users,
  FolderOpen,
  Gavel,
  CalendarDays,
  CheckSquare,
  Receipt,
  BarChart3,
  Bell,
} from 'lucide-react'
import { ModulePlaceholder } from '@/shared/components/module-placeholder'

/**
 * Temporary landing pages for modules whose UIs are delivered in later phases.
 * Each is replaced by its full feature (services + hooks + pages) in turn.
 */

export const MattersPage = () => (
  <ModulePlaceholder
    title="Matter Management"
    description="Every case, from intake to closure."
    icon={Briefcase}
    highlights={[
      'Matter numbering & practice areas',
      'Opposing counsel & court records',
      'Timeline, tasks & hearings',
      'Documents, notes & history',
      'Billing, invoices & expenses',
      'Team assignment & permissions',
    ]}
  />
)

export const ClientsPage = () => (
  <ModulePlaceholder
    title="Clients"
    description="Individuals and corporate clients in one place."
    icon={Users}
    highlights={[
      'Individual & corporate profiles',
      'Contacts & relationships',
      'Communication history',
      'Linked matters & invoices',
      'Conflict-check ready',
      'Search & segmentation',
    ]}
  />
)

export const DocumentsPage = () => (
  <ModulePlaceholder
    title="Documents"
    description="Enterprise document management on Supabase Storage."
    icon={FolderOpen}
    highlights={[
      'Nested folders & categories',
      'Versioning & tags',
      'Preview & full-text search',
      'OCR-ready architecture',
      'Granular permissions',
      'Court orders & evidence vault',
    ]}
  />
)

export const HearingsPage = () => (
  <ModulePlaceholder
    title="Hearings"
    description="Court calendar, scheduling and outcomes."
    icon={Gavel}
    highlights={[
      'Court & judge records',
      'Scheduling & reminders',
      'Outcome tracking',
      'Linked matters',
      'Conflict detection',
      'Agenda export',
    ]}
  />
)

export const CalendarPage = () => (
  <ModulePlaceholder
    title="Calendar"
    description="Daily, weekly, monthly and agenda views."
    icon={CalendarDays}
    highlights={[
      'Day / week / month views',
      'Agenda list',
      'Hearings & tasks overlay',
      'Team availability',
      'Reminders',
      'iCal-ready',
    ]}
  />
)

export const TasksPage = () => (
  <ModulePlaceholder
    title="Tasks & Deadlines"
    description="Assignments, priorities and dependencies."
    icon={CheckSquare}
    highlights={[
      'Assignments & priorities',
      'Due dates & reminders',
      'Dependencies',
      'Overdue tracking',
      'Matter linkage',
      'My-work views',
    ]}
  />
)

export const StaffPage = () => (
  <ModulePlaceholder
    title="Lawyers & Staff"
    description="Profiles, performance and availability."
    icon={Users}
    highlights={[
      'Profiles & qualifications',
      'Bar membership',
      'Assigned matters',
      'Billable hours & performance',
      'Availability & leave',
      'Role & permission mapping',
    ]}
  />
)

export const BillingPage = () => (
  <ModulePlaceholder
    title="Billing"
    description="Time, expenses, invoices and trust accounts."
    icon={Receipt}
    highlights={[
      'Billable hours & rates',
      'Expenses & disbursements',
      'Invoices & PDF generation',
      'Payments & receipts',
      'Trust accounting',
      'Revenue dashboard',
    ]}
  />
)

export const ReportsPage = () => (
  <ModulePlaceholder
    title="Reports"
    description="Matter, productivity and financial analytics."
    icon={BarChart3}
    highlights={[
      'Matter reports',
      'Lawyer productivity',
      'Financial reports',
      'Client reports',
      'Dashboard analytics',
      'Scheduled exports',
    ]}
  />
)

export const NotificationsPage = () => (
  <ModulePlaceholder
    title="Notifications"
    description="Realtime, in-app alerts across your firm."
    icon={Bell}
    highlights={[
      'Realtime delivery',
      'Hearing & deadline reminders',
      'Mentions & assignments',
      'Email architecture ready',
      'Per-user preferences',
      'Read / unread state',
    ]}
  />
)
