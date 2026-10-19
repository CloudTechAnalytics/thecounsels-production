import type { BillingCycle } from '@/shared/types/database.types'

/**
 * Public pricing, shared by the landing page and /pricing. Mirrors the plans
 * table — keep in sync if pricing changes there. Anonymous visitors can't
 * read `plans` under RLS and we don't weaken RLS to expose it. Amounts are
 * naira per full billing period (what checkout charges).
 */
export interface PublicPlan {
  key: string
  name: string
  tagline: string
  users: string
  storage: string
  /** Null = contact sales. */
  prices: Record<BillingCycle, number> | null
  features: string[]
  highlight?: boolean
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    key: 'starter',
    name: 'Basic',
    tagline: 'For solo lawyers and small law firms',
    users: 'Up to 3 users',
    storage: '10 GB storage',
    prices: { monthly: 15000, quarterly: 41000, semiannual: 77000, yearly: 150000 },
    features: ['Core matter management', 'Client management', 'Contacts', 'Documents, hearings & calendar'],
  },
  {
    key: 'professional',
    name: 'Professional',
    tagline: 'For growing and established law firms',
    users: 'Up to 10 users',
    storage: '250 GB storage',
    prices: { monthly: 50000, quarterly: 135000, semiannual: 258000, yearly: 500000 },
    features: ['Everything in Basic', 'AI Workspace', 'HR Workspace', 'Team messaging & WhatsApp reminders'],
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    tagline: 'For larger law firms',
    users: 'Up to 25 users',
    storage: '500 GB storage',
    prices: { monthly: 100000, quarterly: 270000, semiannual: 516000, yearly: 1000000 },
    features: ['Everything in Professional', 'Advanced HR & People Management', 'Branch / multi-office support', 'Workflow automation'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    tagline: 'Tailored pricing — talk to sales',
    users: 'Custom number of users',
    storage: 'Custom storage',
    prices: null,
    features: ['Everything in Business', 'Custom integrations', 'Custom workflows', 'Dedicated onboarding'],
  },
]

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
