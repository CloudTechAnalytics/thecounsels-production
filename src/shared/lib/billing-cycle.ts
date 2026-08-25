import type { BillingCycle, Plan } from '@/shared/types/database.types'

export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly']

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

/** How the cycle reads next to a price, e.g. "₦50,000/quarter". */
export const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: '/month',
  quarterly: '/quarter',
  yearly: '/year',
}

type PlanPrices = Pick<Plan, 'price_monthly' | 'price_quarterly' | 'price_yearly'>

/** The sticker price for one full billing period at the given cycle — what checkout actually charges. */
export function cyclePrice(cycle: BillingCycle, plan: PlanPrices): number {
  const raw = cycle === 'yearly' ? plan.price_yearly : cycle === 'quarterly' ? plan.price_quarterly : plan.price_monthly
  return Number(raw ?? plan.price_monthly)
}

/** Normalizes any cycle's price down to a monthly-equivalent, for MRR/comparison purposes. */
export function monthlyEquivalent(cycle: BillingCycle, plan: PlanPrices): number {
  return cyclePrice(cycle, plan) / CYCLE_MONTHS[cycle]
}

/** e.g. 17 for "17% off vs paying monthly" — null when there's nothing to compare (no monthly price, or this *is* monthly). */
export function cycleDiscountPercent(cycle: BillingCycle, plan: PlanPrices): number | null {
  if (cycle === 'monthly') return null
  const monthly = Number(plan.price_monthly)
  if (!monthly) return null
  const equivalentMonthly = monthlyEquivalent(cycle, plan)
  if (!equivalentMonthly) return null
  const pct = Math.round((1 - equivalentMonthly / monthly) * 100)
  return pct > 0 ? pct : null
}
