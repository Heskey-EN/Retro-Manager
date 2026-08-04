import { Field, Input, Select } from '../ui'
import { JOB_ROLES, setAssignment } from '../lib/roles'
import { useOrgMembers } from '../hooks/useOrgMembers'

// Pick who is on a job, one person per role. Where the team list is readable
// (org admins in suite mode) this is a dropdown of real accounts; otherwise —
// a worker whose RLS only exposes their own row, or local mode with no
// accounts at all — it falls back to typing a name, so the feature still
// works rather than showing an empty list.
export default function AssignPanel({ assignments, onChange, disabled }) {
  const { members, canList, configured } = useOrgMembers()

  const set = (roleKey, person) => onChange(setAssignment(assignments, roleKey, person))

  return (
    // auto-fit rather than fixed breakpoints: this renders both in a full-width
    // panel on the job view and inside a 576px dialog, and the column count
    // should follow the box it is in, not the window. min() keeps the track
    // from outgrowing a 375px screen and forcing the page sideways.
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
      {JOB_ROLES.map((role) => {
        const current = assignments?.[role.key]
        return (
          <Field label={role.label} key={role.key}>
            {canList ? (
              <Select
                value={current?.id || (current?.name ? '__typed__' : '')}
                disabled={disabled}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return set(role.key, null)
                  const m = members.find((x) => x.id === v)
                  set(role.key, m ? { id: m.id, name: m.name } : null)
                }}
              >
                <option value="">— Nobody —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
                {/* A name set before this person left the org (or typed on
                    another device) still shows rather than silently blanking. */}
                {current?.name && !members.some((m) => m.id === current.id) && (
                  <option value="__typed__">{current.name}</option>
                )}
              </Select>
            ) : (
              <Input
                type="text"
                value={current?.name || ''}
                disabled={disabled}
                placeholder={configured ? 'Name' : 'Name (no accounts in local mode)'}
                onChange={(e) => set(role.key, e.target.value.trim() ? { id: current?.id, name: e.target.value } : null)}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}
