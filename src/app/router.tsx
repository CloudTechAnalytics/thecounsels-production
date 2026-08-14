import { createBrowserRouter, Navigate } from 'react-router-dom'
import { OrganizationLayout } from '@/shared/components/layout/organization-layout'
import { PlatformLayout } from '@/shared/components/layout/platform-layout'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  RequireAuth,
  RedirectIfAuthenticated,
  RequirePermission,
  RequirePlatform,
  RequireOrganization,
  RequireNoOrganization,
  RequirePasswordChange,
  RequireActiveSubscription,
} from '@/features/auth/components/route-guards'
import { LandingPage } from '@/features/landing/pages/landing-page'
import { LoginPage } from '@/features/auth/pages/login-page'
import { RegisterPage } from '@/features/auth/pages/register-page'
import { AuthCallbackPage } from '@/features/auth/pages/auth-callback-page'
import { ForgotPasswordPage } from '@/features/auth/pages/forgot-password-page'
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page'
import { ChangePasswordPage } from '@/features/auth/pages/change-password-page'
import { AcceptInvitePage } from '@/features/auth/pages/accept-invite-page'
import { OnboardingPage } from '@/features/onboarding/pages/onboarding-page'
import { BillingCallbackPage } from '@/features/subscription-billing/pages/billing-callback-page'
import { ExpiredSubscriptionPage } from '@/features/subscription-billing/pages/expired-subscription-page'

// Organization (law firm) workspace
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'
import { AdministrationPage } from '@/features/administration/pages/administration-page'
import { SettingsPage } from '@/features/settings/pages/settings-page'
import { BillingPage } from '@/features/billing/pages/billing-page'
import { ReportsPage } from '@/features/reports/pages/reports-page'
import { ClientsPage } from '@/features/clients/pages/clients-page'
import { NotificationsPage } from '@/features/notifications/pages/notifications-page'
import { MessagesPage } from '@/features/messaging/pages/messages-page'
import { MattersPage } from '@/features/matters/pages/matters-page'
import { MatterDetailPage } from '@/features/matters/pages/matter-detail-page'
import { DocumentsPage } from '@/features/documents/pages/documents-page'
import { BulkImportPage } from '@/features/documents/pages/bulk-import-page'
import { HrLayout } from '@/features/hr/components/hr-layout'
import { HrOverviewPage } from '@/features/hr/pages/hr-overview-page'
import { EmployeesPage } from '@/features/hr/pages/employees-page'
import { OnboardingPage as HrOnboardingPage } from '@/features/hr/pages/onboarding-page'
import { LeavePage } from '@/features/hr/pages/leave-page'
import { HrRequestsPage } from '@/features/hr/pages/hr-requests-page'
import { HrDocumentsPage } from '@/features/hr/pages/hr-documents-page'
import { AnnouncementsPage } from '@/features/hr/pages/announcements-page'
import { HrReportsPage } from '@/features/hr/pages/hr-reports-page'
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

/**
 * Personal account settings (profile, password, theme, notifications,
 * sessions) apply to every signed-in user — platform staff included — so
 * this route sits outside both RequirePlatform and RequireOrganization
 * rather than living inside the firm workspace, which a pure platform admin
 * (no active org, not in Support Mode) never enters. It borrows whichever
 * shell fits: PlatformLayout renders fine standalone; OrganizationLayout
 * needs an active org to render its own children instead of a "no
 * workspace" state, which support mode / firm membership both provide.
 */
function SettingsLayout() {
  const { isPlatformAdmin, supportOrgId } = useAuth()
  return isPlatformAdmin && !supportOrgId ? <PlatformLayout /> : <OrganizationLayout />
}

/**
 * '/' has to resolve to *something* for every org member, but the practice
 * Dashboard (matters/hearings/billing KPIs) is meaningless for a pure HR
 * role — HR has its own dashboard at /hr. dashboard.view is what actually
 * gates this rather than a role-name check, so it also self-corrects for
 * any other role a firm configures the same way.
 */
function WorkspaceHome() {
  const { has } = usePermissions()
  if (has('dashboard.view')) return <DashboardPage />
  if (has('hr.view_reports')) return <Navigate to="/hr" replace />
  return <Navigate to="/notifications" replace />
}

export const router = createBrowserRouter([
  // Public marketing page; unauthenticated visitors to '/' land here.
  { path: '/welcome', element: <LandingPage /> },
  // Workspace-branded login — temporary stand-in for {slug}.thecounsel.app
  // until wildcard subdomains are configured (see LoginPage's own comment).
  // Purely cosmetic: real auth + membership scoping is unchanged either way.
  { path: '/w/:slug', element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
  {
    path: '/auth',
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
      { path: 'register', element: <RedirectIfAuthenticated><RegisterPage /></RedirectIfAuthenticated> },
      { path: 'callback', element: <AuthCallbackPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'accept-invite', element: <AcceptInvitePage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // Forced stop between signing in with a temp password and the app — reachable
      // regardless of the must_change_password flag, unlike everything below it.
      { path: '/auth/change-password', element: <ChangePasswordPage /> },

      {
        element: <RequirePasswordChange />,
        children: [
          // Personal account settings — reachable by any authenticated user,
          // platform admin or firm member, regardless of org membership.
          {
            path: '/settings',
            element: <SettingsLayout />,
            children: [{ index: true, element: <SettingsPage /> }],
          },

          // Self-service onboarding wizard — reachable only by an
          // authenticated user with no firm yet (see RequireNoOrganization).
          {
            path: '/onboarding',
            element: <RequireNoOrganization />,
            children: [{ index: true, element: <OnboardingPage /> }],
          },

          // Paystack's redirect target after checkout — deliberately outside
          // both RequireOrganization and RequireNoOrganization; whoever just
          // finished (or abandoned) checkout already has an org by this point.
          { path: '/subscription/callback', element: <BillingCallbackPage /> },
          { path: '/subscription/expired', element: <ExpiredSubscriptionPage /> },

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
                element: <RequireActiveSubscription />,
                children: [
                  {
                    element: <OrganizationLayout />,
                    children: [
                      { index: true, element: <WorkspaceHome /> },
                      { path: 'matters', element: withPermission(<MattersPage />, 'matters.view') },
                      { path: 'matters/:id', element: withPermission(<MatterDetailPage />, 'matters.view') },
                      { path: 'clients', element: withPermission(<ClientsPage />, 'clients.view') },
                      { path: 'documents', element: withPermission(<DocumentsPage />, 'documents.view') },
                      { path: 'documents/import', element: withPermission(<BulkImportPage />, 'documents.upload') },
                      { path: 'hearings', element: withPermission(<HearingsPage />, 'hearings.view') },
                      { path: 'calendar', element: withPermission(<CalendarPage />, 'calendar.view') },
                      { path: 'tasks', element: withPermission(<TasksPage />, 'tasks.view') },
                      { path: 'staff', element: withPermission(<StaffPage />, 'staff.view') },
                      { path: 'billing', element: withPermission(<BillingPage />, 'billing.view') },
                      { path: 'reports', element: withPermission(<ReportsPage />, 'reports.view') },
                      { path: 'notifications', element: <NotificationsPage /> },
                      { path: 'messages', element: withPermission(<MessagesPage />, 'messaging.view') },
                      {
                        path: 'administration',
                        element: withPermission(<AdministrationPage />, ['organization.view', 'members.view'], 'any'),
                      },
                    ],
                  },

                  // ── HR workspace — entirely separate shell, reached via
                  // "HR Workspace" in the profile menu, not the practice
                  // sidebar. No Matters/Clients/Documents in this tree at all.
                  {
                    path: 'hr',
                    element: <HrLayout />,
                    children: [
                      { index: true, element: withPermission(<HrOverviewPage />, 'hr.view_reports') },
                      { path: 'employees', element: withPermission(<EmployeesPage />, 'staff.manage') },
                      { path: 'onboarding', element: withPermission(<HrOnboardingPage />, 'onboarding.view_own') },
                      { path: 'leave', element: withPermission(<LeavePage />, 'leave.request') },
                      { path: 'requests', element: withPermission(<HrRequestsPage />, 'hr_requests.submit') },
                      { path: 'documents', element: withPermission(<HrDocumentsPage />, 'hr_documents.view_own') },
                      { path: 'announcements', element: withPermission(<AnnouncementsPage />, 'hr_announcements.view') },
                      { path: 'reports', element: withPermission(<HrReportsPage />, 'hr.view_reports') },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
