/**
 * Monthly payroll maths for Nigerian employers.
 *
 * Rules (all rates come from payroll_settings, these are just the defaults
 * seeded by migration 0175):
 * - Pension (Pension Reform Act 2014): employee 8% + employer 10% of monthly
 *   emoluments, i.e. basic + housing + transport.
 * - NHF (National Housing Fund Act): 2.5% of basic.
 * - PAYE (Nigeria Tax Act 2025, from 1 Jan 2026): annual taxable income =
 *   annual gross − employee pension − NHF − rent relief (20% of annual rent,
 *   capped at ₦500,000), taxed on progressive annual bands; monthly PAYE is
 *   the annual figure ÷ 12. Anyone earning at or below the national minimum
 *   wage pays no PAYE.
 */

export interface TaxBand {
  /** Upper bound of the band on annual taxable income; null = no ceiling. */
  upto: number | null
  /** Percent, e.g. 15 for 15%. */
  rate: number
}

export interface PayrollRates {
  pension_employee_rate: number
  pension_employer_rate: number
  nhf_rate: number
  rent_relief_rate: number
  rent_relief_cap: number
  minimum_wage_monthly: number
  tax_bands: TaxBand[]
}

export const DEFAULT_TAX_BANDS: TaxBand[] = [
  { upto: 800_000, rate: 0 },
  { upto: 3_000_000, rate: 15 },
  { upto: 12_000_000, rate: 18 },
  { upto: 25_000_000, rate: 21 },
  { upto: 50_000_000, rate: 23 },
  { upto: null, rate: 25 },
]

export const DEFAULT_PAYROLL_RATES: PayrollRates = {
  pension_employee_rate: 8,
  pension_employer_rate: 10,
  nhf_rate: 2.5,
  rent_relief_rate: 20,
  rent_relief_cap: 500_000,
  minimum_wage_monthly: 70_000,
  tax_bands: DEFAULT_TAX_BANDS,
}

export interface SalaryInput {
  basic: number
  housing: number
  transport: number
  other_allowances: number
  annual_rent: number
  pension_enabled: boolean
  nhf_enabled: boolean
  other_deductions: number
}

/** One-offs for this month only (0205). */
export interface PayslipExtras {
  /** Bonus, overtime, taxable allowances. */
  taxable_earnings: number
  /** Allowances paid without tax (e.g. reimbursed costs). */
  non_taxable_earnings: number
  /** One-off deductions plus loan / advance repayments. */
  deductions: number
}

export interface BandLine {
  from: number
  to: number | null
  rate: number
  taxable: number
  tax: number
}

export interface PayrollResult {
  gross: number
  pension_employee: number
  pension_employer: number
  nhf: number
  paye: number
  other_deductions: number
  net: number
  tax_detail: {
    annual_gross: number
    annual_pension: number
    annual_nhf: number
    rent_relief: number
    annual_taxable: number
    annual_tax: number
    exempt_minimum_wage: boolean
    bands: BandLine[]
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Tax on an annual taxable amount, band by band. Bands must be ascending. */
export function annualTax(taxable: number, bands: TaxBand[]): { total: number; lines: BandLine[] } {
  let floor = 0
  let total = 0
  const lines: BandLine[] = []
  for (const b of bands) {
    if (taxable <= floor) break
    const ceiling = b.upto ?? Infinity
    const inBand = Math.min(taxable, ceiling) - floor
    const tax = (inBand * b.rate) / 100
    lines.push({ from: floor, to: b.upto, rate: b.rate, taxable: r2(inBand), tax: r2(tax) })
    total += tax
    floor = ceiling
  }
  return { total: r2(total), lines }
}

export function computePayslip(s: SalaryInput, rates: PayrollRates, extras?: PayslipExtras): PayrollResult {
  const regular = r2(s.basic + s.housing + s.transport + s.other_allowances)
  const x = extras ?? { taxable_earnings: 0, non_taxable_earnings: 0, deductions: 0 }
  const gross = r2(regular + x.taxable_earnings + x.non_taxable_earnings)
  const pensionable = s.basic + s.housing + s.transport
  const pension_employee = s.pension_enabled ? r2((pensionable * rates.pension_employee_rate) / 100) : 0
  const pension_employer = s.pension_enabled ? r2((pensionable * rates.pension_employer_rate) / 100) : 0
  const nhf = s.nhf_enabled ? r2((s.basic * rates.nhf_rate) / 100) : 0

  const annual_gross = regular * 12
  const annual_pension = pension_employee * 12
  const annual_nhf = nhf * 12
  const rent_relief = Math.min((s.annual_rent * rates.rent_relief_rate) / 100, rates.rent_relief_cap)
  const annual_taxable = Math.max(0, annual_gross - annual_pension - annual_nhf - rent_relief)
  const exempt = regular <= rates.minimum_wage_monthly
  const { total, lines } = exempt ? { total: 0, lines: [] } : annualTax(annual_taxable, rates.tax_bands)
  // A one-off is taxed on the margin: the extra annual tax it causes, all in
  // this month — not as if it were paid every month.
  const oneOffTax = x.taxable_earnings > 0 && !exempt
    ? annualTax(annual_taxable + x.taxable_earnings, rates.tax_bands).total - total
    : 0
  const paye = r2(total / 12 + oneOffTax)

  const other_deductions = r2(s.other_deductions + x.deductions)
  const net = r2(gross - pension_employee - nhf - paye - other_deductions)

  return {
    gross,
    pension_employee,
    pension_employer,
    nhf,
    paye,
    other_deductions,
    net,
    tax_detail: {
      annual_gross: r2(annual_gross),
      annual_pension: r2(annual_pension),
      annual_nhf: r2(annual_nhf),
      rent_relief: r2(rent_relief),
      annual_taxable: r2(annual_taxable),
      annual_tax: total,
      exempt_minimum_wage: exempt,
      bands: lines,
    },
  }
}

/** Accepts whatever is stored in payroll_settings.tax_bands and returns
 * well-formed ascending bands, falling back to the defaults if it's unusable. */
export function parseTaxBands(raw: unknown): TaxBand[] {
  if (!Array.isArray(raw)) return DEFAULT_TAX_BANDS
  const bands = raw
    .map((b) => ({ upto: b?.upto == null ? null : Number(b.upto), rate: Number(b?.rate) }))
    .filter((b) => Number.isFinite(b.rate) && (b.upto === null || Number.isFinite(b.upto)))
  if (bands.length === 0) return DEFAULT_TAX_BANDS
  return bands.sort((a, b) => (a.upto ?? Infinity) - (b.upto ?? Infinity))
}
