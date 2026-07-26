import { jobAddress, jobReference, jobPostcode, jobCustomer, jobMeasure, formatDate } from './display'
import { statusLabel } from './status'

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 })

// The job values that can be mapped onto a template field.
export const JOB_FIELDS = [
  { key: 'address', label: 'Property address' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'customer', label: 'Customer' },
  { key: 'measure', label: 'Measure' },
  { key: 'reference', label: 'Reference' },
  { key: 'start_date', label: 'Start date' },
  { key: 'end_date', label: 'End date' },
  { key: 'status', label: 'Stage' },
  { key: 'cost_total', label: 'Total cost' },
  { key: 'revenue', label: 'Projected revenue' },
  { key: 'profit', label: 'Profit' },
]

// Resolve every mappable job value to a string, ready to write into a PDF.
export function jobDataValues(job) {
  const items = job?.costing?.items || []
  const total = items.reduce((s, i) => s + (Number(i.cost ?? i.amount) || 0), 0)
  const revenue = Number(job?.costing?.revenue) || 0
  const profit = revenue - total
  return {
    address: jobAddress(job),
    postcode: jobPostcode(job),
    customer: jobCustomer(job),
    measure: jobMeasure(job),
    reference: jobReference(job),
    start_date: formatDate(job?.start_date),
    end_date: formatDate(job?.end_date),
    status: statusLabel(job?.status),
    cost_total: total ? GBP.format(total) : '',
    revenue: revenue ? GBP.format(revenue) : '',
    profit: revenue || total ? GBP.format(profit) : '',
  }
}
