// Read a normalised field off a job, falling back to the raw CSV row so that
// both manually-added jobs and imported ones display consistently.
function field(job, key, ...dataKeys) {
  if (job?.[key]) return job[key]
  for (const k of dataKeys) {
    const v = job?.data?.[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

// The property address is the headline everywhere. Read it straight from the
// data so jobs imported before addresses were the title still display correctly.
export function jobAddress(job) {
  const a = job?.data?.['Property Address'] || job?.data?.Address || job?.address
  if (a && String(a).trim()) return String(a).trim()
  return job?.title || 'Untitled job'
}

export const jobReference = (job) => field(job, 'reference', 'Reference', 'Job Reference', 'Ref')
export const jobPostcode = (job) => field(job, 'postcode', 'Postcode', 'Post Code')
export const jobCustomer = (job) => field(job, 'customer', 'Customer', 'Client')
export const jobMeasure = (job) => field(job, 'measure', 'Measure', 'Work Type')

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
