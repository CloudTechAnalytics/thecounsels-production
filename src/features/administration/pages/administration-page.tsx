import * as React from 'react'
import { Building2, Users, ShieldCheck, CreditCard, LifeBuoy } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { MembersPanel } from '@/features/administration/components/members-panel'
import { OrganizationSettings } from '@/features/administration/components/organization-settings'
import { RolesViewer } from '@/features/administration/components/roles-viewer'
import { PlanSummary } from '@/features/administration/components/plan-summary'
import { FirmSupportPanel } from '@/features/support/components/firm-support-panel'
import { PageHeader } from '@/shared/components/page-header'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'

const TABS = [
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'plan', label: 'Plan & Billing', icon: CreditCard },
  { key: 'support', label: 'Support', icon: LifeBuoy },
] as const
type Tab = (typeof TABS)[number]['key']

/** Organization administration — manage this firm. Firm-scoped only. */
export function AdministrationPage() {
  const { activeMembership, activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [tab, setTab] = React.useState<Tab>('organization')

  if (!activeOrgId) return null

  if (!has('members.view') && !has('organization.view')) {
    return (
      <div>
        <PageHeader title="Firm Settings" />
        <p className="text-sm text-muted-foreground">
          You don't have access to firm administration. Contact your firm's Managing Partner.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Firm Settings"
        description={`Manage ${activeMembership?.organization.name ?? 'your firm'} — profile, people, roles and plan.`}
        actions={<Badge variant="outline">{activeMembership?.role.name}</Badge>}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'organization' && <OrganizationSettings />}
      {tab === 'members' && <MembersPanel organizationId={activeOrgId} onNavigateToPlan={() => setTab('plan')} />}
      {tab === 'roles' && <RolesViewer />}
      {tab === 'plan' && <PlanSummary />}
      {tab === 'support' && <FirmSupportPanel organizationId={activeOrgId} />}
    </div>
  )
}
