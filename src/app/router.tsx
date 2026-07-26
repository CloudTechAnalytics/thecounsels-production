import { createBrowserRouter, Navigate } from 'react-router-dom'
import { OrganizationLayout } from '@/shared/components/layout/organization-layout'
import { PlatformLayout } from '@/shared/components/layout/platform-layout'
import {
  RequireAuth,
  RedirectIfAuthenticated,
  RequirePermission,
  RequirePlatform,
  RequireOrganization,
} from '@/features/auth/components/route-guards'
import { LoginPage } from '@/features/auth/pages/login-page'
import { ForgotPasswordPage } from '@/features/auth/pages/forgot-password-page'
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page'
import { AcceptInvitePage } from '@/features/auth/pages/accept-invite-page'

// Organization (law firm) workspace
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'
import { AdministrationPage } from '@/features/administration/pages/administration-page'
import { SettingsPage } from '@/app/placeholder-pages'
import { BillingPage } from '@/features/billing/pages/billing-page'
import { ReportsPage } from '@/features/reports/pages/reports-page'
import { ClientsPage } from '@/features/clients/pages/clients-page'
import { NotificationsPage } from '@/features/notifications/pages/notifications-page'
import { MattersPage } from '@/features/matters/pages/matters-page'
import { MatterDetailPage } from '@/features/matters/pages/matter-detail-page'
import { DocumentsPage } from '@/features/documents/pages/documents-page'
import { HearingsPage } from '@/features/hearings/pages/hearings-page'
import { CalendarPage } from '@/features/calendar/pages/calendar-page'
import { TasksPage } from '@/features/tasks/pages/tasks-page'
import { StaffPage } from '@/features/staff/pages/staff-page'

// CloudTech platform console
import { PlatformDashboardPage } from '@/features/platform/pages/platform-dashboard-page'
import { OrganizationsPage } from '@/features/platform/pages/organizations-page'
import { SubscriptionsPage } from '@/features/platform/pages/subscriptions-page'
import { PlansPage } from '@/features/platform/pages/plans-page'
import { BillingPage as PlatformBillingPage } from '@/features/platform/pages/billing-page'
import { AnalyticsPage } from '@/features/platform/pages/analytics-page'
import { RevenueAnalyticsPage } from '@/features/platform/pages/revenue-analytics-page'
import { OrganizationUsersPage } from '@/features/platform/pages/organization-users-page'
import { AuditLogsPage } from '@/features/platform/pages/audit-logs-page'
import { PlatformUsersPage } from '@/features/platform/pages/platform-users-page'
import { PlatformSettingsPage } from '@/features/platform/pages/platform-settings-page'
import { SupportTicketsPage } from '@/features/platform/pages/support-tickets-page'
import { SystemHealthPage } from '@/features/platform/pages/system-health-page'

const withPermission = (
  node: React.ReactNode,
  permission: Parameters<typeof RequirePermission>[0]['permission'],
  mode: 'all' | 'any' = 'all',
) => (
  <RequirePermission permission={permission} mode={mode}>
    {node}
  </RequirePermission>
)

export const router = createBrowserRouter([
  {
    path: '/auth',
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'accept-invite', element: <AcceptInvitePage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // ── CloudTech Platform console ──────────────────────────────
      {
        path: '/platform',
        element: <RequirePlatform />,
        children: [
          {
            element: <PlatformLayout />,
            children: [
              { index: true, element: <PlatformDashboardPage /> },
              { path: 'organizations', element: <OrganizationsPage /> },
              { path: 'organization-users', element: <OrganizationUsersPage /> },
              { path: 'subscriptions', element: <SubscriptionsPage /> },
              { path: 'billing', element: <PlatformBillingPage /> },
              { path: 'revenue', element: <RevenueAnalyticsPage /> },
              { path: 'analytics', element: <AnalyticsPage /> },
              { path: 'tickets', element: <SupportTicketsPage /> },
              { path: 'audit', element: <AuditLogsPage /> },
              { path: 'health', element: <SystemHealthPage /> },
              { path: 'plans', element: <PlansPage /> },
              { path: 'users', element: <PlatformUsersPage /> },
              { path: 'settings', element: <PlatformSettingsPage /> },
            ],
          },
        ],
      },

      // ── Law-firm workspace ──────────────────────────────────────
      {
        path: '/',
        element: <RequireOrganization />,
        children: [
          {
            element: <OrganizationLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'matters', element: withPermission(<MattersPage />, 'matters.view') },
              { path: 'matters/:id', element: withPermission(<MatterDetailPage />, 'matters.view') },
              { path: 'clients', element: withPermission(<ClientsPage />, 'clients.view') },
              { path: 'documents', element: withPermission(<DocumentsPage />, 'documents.view') },
              { path: 'hearings', element: withPermission(<HearingsPage />, 'hearings.view') },
              { path: 'calendar', element: withPermission(<CalendarPage />, 'calendar.view') },
              { path: 'tasks', element: withPermission(<TasksPage />, 'tasks.view') },
              { path: 'staff', element: withPermission(<StaffPage />, 'staff.view') },
              { path: 'billing', element: withPermission(<BillingPage />, 'billing.view') },
              { path: 'reports', element: withPermission(<ReportsPage />, 'reports.view') },
              { path: 'notifications', element: <NotificationsPage /> },
              {
                path: 'administration',
                element: withPermission(<AdministrationPage />, ['organization.view', 'members.view'], 'any'),
              },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
