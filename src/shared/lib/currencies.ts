/** Currencies this app can actually bill in — Paystack's own live-supported
 * settlement currencies, in the order they should be offered: Nigeria (the
 * home market) first, then the other African markets Paystack directly
 * supports, then USD last as the universal fallback for a prospect
 * anywhere else on the continent (Paystack accepts international card
 * payment in USD regardless of the buyer's own country). */
export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_META: Record<SupportedCurrency, { label: string; symbol: string }> = {
  NGN: { label: 'Nigerian Naira', symbol: '₦' },
  GHS: { label: 'Ghanaian Cedi', symbol: 'GH₵' },
  ZAR: { label: 'South African Rand', symbol: 'R' },
  KES: { label: 'Kenyan Shilling', symbol: 'KSh' },
  USD: { label: 'US Dollar', symbol: '$' },
}

/** A light nudge toward the locally-relevant currency based on the country
 * picked earlier in onboarding — never a hard restriction, still fully
 * overridable in the currency picker itself. Anywhere not listed here (most
 * of the continent) reasonably defaults to USD, the one currency that
 * works for a card payment from essentially anywhere. */
const COUNTRY_CURRENCY: Record<string, SupportedCurrency> = {
  Nigeria: 'NGN',
  Ghana: 'GHS',
  'South Africa': 'ZAR',
  Kenya: 'KES',
}

export function defaultCurrencyForCountry(country: string | null | undefined): SupportedCurrency {
  return (country && COUNTRY_CURRENCY[country]) || 'USD'
}
