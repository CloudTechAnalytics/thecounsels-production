/** Currencies this app can actually bill in — Paystack's own live-supported
 * settlement currencies, in the order they should be offered: Nigeria (the
 * home market) first, then the other African markets Paystack directly
 * supports, then USD last as the universal fallback for a prospect
 * anywhere else on the continent (Paystack accepts international card
 * payment in USD regardless of the buyer's own country). */
export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

/** Of SUPPORTED_CURRENCIES, the ones actually usable at checkout today —
 * everything else is real, priced (plan_prices, 0161/0162) and ready in the
 * Platform Console, but the Paystack merchant account itself only has NGN
 * enabled right now. Selecting GHS/ZAR/KES/USD reaches Paystack fine from
 * our side, but Paystack itself rejects the currency ("Currency not
 * supported by merchant") — confirmed live 2026-08-31. Add a currency here
 * the day it's actually enabled on the Paystack account; nothing else in
 * the codebase needs to change. */
export const ENABLED_CURRENCIES: readonly SupportedCurrency[] = ['NGN']

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
  const mapped = (country && COUNTRY_CURRENCY[country]) || 'USD'
  // Never default to a currency checkout can't actually complete — falls
  // back to the first enabled one (NGN today) instead.
  return ENABLED_CURRENCIES.includes(mapped) ? mapped : ENABLED_CURRENCIES[0]
}
