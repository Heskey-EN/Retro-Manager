import { jobAddress, jobPostcode } from './display'
import { STATUS_VALUES } from './status'

// Group jobs into "projects" by the road they sit on and their postcode area —
// a whole-street or postcode-cluster retrofit scheme becomes one project.

// The outward part of a UK postcode (e.g. "PR2 8HJ" -> "PR2").
function outward(pc) {
  return String(pc || '').trim().toUpperCase().split(/\s+/)[0] || ''
}

// The road, derived by dropping a leading house number/name from the address.
function deriveRoad(address) {
  let s = String(address || '').trim()
  s = s.replace(/^(flat|apt|apartment|unit)\s+\S+\s*,?\s*/i, '')
  s = s.replace(/^\d+[a-z]?(\s*-\s*\d+[a-z]?)?\s*,?\s*/i, '')
  return s.trim()
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function projectOf(job) {
  const road = deriveRoad(jobAddress(job))
  const out = outward(jobPostcode(job))
  const nroad = norm(road)
  const key = nroad || out ? `${nroad}|${out}` : '__ungrouped__'
  return { key, road: road || 'Unknown road', outward: out }
}

// Returns projects sorted largest-first, each with per-stage counts.
export function groupProjects(jobs) {
  const map = new Map()
  for (const job of jobs) {
    const { key, road, outward: out } = projectOf(job)
    if (!map.has(key)) map.set(key, { key, road, outward: out, jobs: [], postcodes: new Set() })
    const p = map.get(key)
    p.jobs.push(job)
    const pc = jobPostcode(job)
    if (pc) p.postcodes.add(pc)
  }

  const projects = [...map.values()].map((p) => {
    const counts = Object.fromEntries(STATUS_VALUES.map((s) => [s, 0]))
    for (const j of p.jobs) if (counts[j.status] != null) counts[j.status] += 1
    return {
      ...p,
      counts,
      postcodes: [...p.postcodes],
      label: p.outward ? `${p.road} · ${p.outward}` : p.road,
    }
  })

  projects.sort((a, b) => b.jobs.length - a.jobs.length || a.road.localeCompare(b.road))
  return projects
}
