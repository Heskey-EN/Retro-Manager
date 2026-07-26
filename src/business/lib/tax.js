// UK self-employed (sole trader) tax estimate — income tax + Class 4 National
// Insurance on trading profit. Rates for the 2026/27 tax year (rUK, non-Scottish
// rates; Class 2 NI abolished from April 2024). Estimates only — not tax advice.

export const TAX_RATES = {
  yearLabel: '2026/27',
  personalAllowance: 12570,
  paTaperThreshold: 100000, // allowance shrinks £1 per £2 above this
  basicBand: 37700, // taxed at 20% above the allowance
  higherLimit: 125140, // taxable income above (higherLimit - PA) hits 45%
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  class4Lower: 12570,
  class4Upper: 50270,
  class4MainRate: 0.06,
  class4UpperRate: 0.02,
}

// Estimate tax + NI due on an annual trading profit figure.
export function calcTax(profit) {
  const R = TAX_RATES
  const p = Math.max(0, profit)

  // Personal allowance (tapered above £100k)
  let allowance = R.personalAllowance
  if (p > R.paTaperThreshold) {
    allowance = Math.max(0, allowance - (p - R.paTaperThreshold) / 2)
  }

  const taxable = Math.max(0, p - allowance)
  const higherBandTop = Math.max(0, R.higherLimit - allowance)

  const atBasic = Math.min(taxable, R.basicBand)
  const atHigher = Math.min(Math.max(taxable - R.basicBand, 0), higherBandTop - R.basicBand)
  const atAdditional = Math.max(taxable - higherBandTop, 0)
  const incomeTax = atBasic * R.basicRate + atHigher * R.higherRate + atAdditional * R.additionalRate

  const niMain = Math.min(Math.max(p - R.class4Lower, 0), R.class4Upper - R.class4Lower) * R.class4MainRate
  const niUpper = Math.max(p - R.class4Upper, 0) * R.class4UpperRate
  const ni = niMain + niUpper

  const total = incomeTax + ni
  return {
    profit: p,
    incomeTax,
    ni,
    total,
    takeHome: p - total,
    effectiveRate: p > 0 ? total / p : 0,
  }
}

// Suggested % of each pound of profit to set aside, based on projected
// full-year profit (uses the effective rate with a small safety margin,
// clamped to sensible bounds).
export function setAsideRate(projectedAnnualProfit) {
  const { effectiveRate } = calcTax(projectedAnnualProfit)
  if (projectedAnnualProfit <= TAX_RATES.class4Lower) return 0
  return Math.min(0.45, Math.max(0.1, effectiveRate + 0.02))
}
