import {
  LayoutDashboard,
  Building2,
  UsersRound,
  CreditCard,
  Receipt,
  LineChart,
  BarChart3,
  LifeBuoy,
  ScrollText,
  Bug,
  Activity,
  Tags,
  ShieldCheck,
  Settings2,
  type LucideIcon,
} from 'lucide-react'

export interface PlatformNavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export interface PlatformNavSection {
  heading?: string
  items: PlatformNavItem[]
}

/** CloudTech Platform console navigation — SaaS administration only, never firm data. */
export const PLATFORM_NAVIGATION: PlatformNavSection[] = [
  {
    items: [{ label: 'Dashboard', to: '/platform', icon: LayoutDashboard, end: true }],
  },
  {
    heading: 'Tenancy',
    items: [
      { label: 'Organizations', to: '/platform/organizations', icon: Building2 },
      { label: 'Organization Users', to: '/platform/organization-users', icon: UsersRound },
      { label: 'Subscriptions', to: '/platform/subscriptions', icon: CreditCard },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { label: 'Billing', to: '/platform/billing', icon: Receipt },
      { label: 'Revenue Analytics', to: '/platform/revenue', icon: LineChart },
      { label: 'Platform Analytics', to: '/platform/analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Support Tickets', to: '/platform/tickets', icon: LifeBuoy },
      { label: 'Audit Logs', to: '/platform/audit', icon: ScrollText },
      { label: 'Error Logs', to: '/platform/errors', icon: Bug },
      { label: 'System Health', to: '/platform/health', icon: Activity },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { label: 'Plans & Pricing', to: '/platform/plans', icon: Tags },
      { label: 'Platform Users', to: '/platform/users', icon: ShieldCheck },
      { label: 'Platform Settings', to: '/platform/settings', icon: Settings2 },
    ],
  },
]
