// Admin control: which team members (levels 1–2) may log expenses.
// Flips memberships.can_add_expenses under the hub's existing RLS (org
// admins may update their org's non-admin rows); the biz_expenses insert
// policy checks the same flag server-side, so this toggle IS the permission.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from './ui.jsx'
import { supabase } from './../lib/supabaseClient.js'
import { useAuth } from '../../hooks/useAuth.js'

const LEVEL_NAMES = { 1: 'Office Worker', 2: 'Senior Worker', 3: 'Organisation Admin', 4: 'Master Admin' }

export default function TeamPermissionsModal({ onClose }) {
  const { orgId } = useAuth()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true
    supabase
      .from('memberships')
      .select('*, profiles ( email, full_name )')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('access_level', { ascending: true })
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) setError(err.message)
        else setRows(data || [])
      })
    return () => {
      active = false
    }
  }, [orgId])

  // The column ships with hub migration 0007 — if it's missing, every row
  // reads undefined and the update below would fail. Say so plainly.
  const migrationMissing = rows?.length > 0 && !('can_add_expenses' in rows[0])

  async function toggle(row) {
    const next = !row.can_add_expenses
    setBusyId(row.id)
    setError('')
    const { error: err } = await supabase
      .from('memberships')
      .update({ can_add_expenses: next })
      .eq('id', row.id)
    setBusyId(null)
    if (err) {
      setError(`Couldn't save: ${err.message}`)
      return
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, can_add_expenses: next } : r)))
  }

  const workers = (rows || []).filter((r) => r.access_level < 3)
  const admins = (rows || []).filter((r) => r.access_level >= 3)
  const nameOf = (r) => r.profiles?.full_name || r.profiles?.email || 'Unknown member'

  return (
    <Modal title="Who can log expenses?" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">
        Ticked team members get an <strong>Expenses</strong> tab in RetroManager where they can
        log what they've spent — it lands straight in your Finance figures. They never see
        finances, invoices or anyone else's expenses.
      </p>

      {!rows && !error && (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading your team…
        </p>
      )}

      {migrationMissing && (
        <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-xs font-semibold text-amber-deep">
          The hub database is missing the expense-permission migration — run
          supabase/hub/0007_team_expenses.sql in the hub project's SQL editor first.
        </p>
      )}

      {rows && workers.length === 0 && (
        <p className="py-2 text-sm text-slate-500">
          No level 1–2 team members yet — invite them from Manage team on the Hub.
        </p>
      )}

      {workers.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {workers.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{nameOf(r)}</span>
                <span className="block text-xs text-slate-500">{LEVEL_NAMES[r.access_level]}</span>
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {busyId === r.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <input
                    type="checkbox"
                    checked={Boolean(r.can_add_expenses)}
                    disabled={migrationMissing}
                    onChange={() => toggle(r)}
                    className="h-4 w-4 accent-ember"
                  />
                )}
                Can log
              </label>
            </li>
          ))}
        </ul>
      )}

      {admins.length > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
          Organisation Admins ({admins.map(nameOf).join(', ')}) always have full Finance access.
        </p>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
    </Modal>
  )
}
