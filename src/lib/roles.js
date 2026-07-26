// Who does what on a retrofit job. Roles follow the PAS 2035 delivery team so
// the labels match how the work is actually talked about on site.
export const JOB_ROLES = [
  { key: 'assessor', label: 'Assessor', short: 'AS' },
  { key: 'coordinator', label: 'Coordinator', short: 'CO' },
  { key: 'designer', label: 'Designer', short: 'DE' },
  { key: 'installer', label: 'Installer', short: 'IN' },
  { key: 'evaluator', label: 'Evaluator', short: 'EV' },
]

export const roleLabel = (key) => JOB_ROLES.find((r) => r.key === key)?.label || key

// Initials for the little avatar chips on a job card.
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Assignments are stored as { role: { id, name } }; drop empty roles so an
// unassigned job holds {} rather than a map of nulls.
export function setAssignment(assignments, role, person) {
  const next = { ...(assignments || {}) }
  if (!person || !person.name) delete next[role]
  else next[role] = { id: person.id || null, name: person.name }
  return next
}

export const assignedPeople = (assignments) =>
  JOB_ROLES.map((r) => ({ role: r, person: assignments?.[r.key] })).filter((x) => x.person?.name)
