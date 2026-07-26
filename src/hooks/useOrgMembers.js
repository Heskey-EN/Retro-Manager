import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { getActiveOrgId } from '../lib/orgContext'

// The people who can be put on a job: the active members of your organisation.
//
// RLS reality (hub 0001/0003): org admins read every membership + profile in
// their org, but levels 1–2 can only read their OWN row. So this returns the
// full team for an admin and just yourself for a worker — which is why a job's
// assignments store the person's NAME as well as their id, so everyone can
// still see who is on a job.
//
// Without Supabase configured (local mode) there are no accounts at all, so
// it reports `canList: false` and the UI falls back to typing a name.
export function useOrgMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    const orgId = getActiveOrgId()
    if (!orgId) return undefined
    let active = true
    supabase
      .from('memberships')
      .select('user_id, access_level, profiles ( email, full_name )')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) {
          setError(err.message)
        } else {
          setMembers(
            (data || [])
              .map((m) => ({
                id: m.user_id,
                name: m.profiles?.full_name?.trim() || m.profiles?.email || 'Unknown member',
                level: m.access_level,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  return {
    members,
    loading,
    error,
    // More than yourself visible = you can pick from a real team list.
    canList: isSupabaseConfigured && members.length > 1,
    configured: isSupabaseConfigured,
  }
}
