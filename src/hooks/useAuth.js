import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { setActiveOrgId } from '../lib/orgContext'

// Suite auth: tracks the shared Hub session (cookie from ecofutures.uk) and
// the signed-in user's organisation membership + access level 1-4:
//   1 Office Worker · 2 Senior Worker · 3 Organisation Admin · 4 Master Admin
// Level rules for THIS app: everyone reads/edits jobs, level >= 2 deletes,
// level >= 3 manages the team (on the Hub). RLS in the hub project is the
// real enforcement — these values only shape the UI.
// Safe to use when Supabase isn't configured — reports `configured: false`
// and the app runs on the local backend.
//
// ONE instance for the whole app: AuthProvider (mounted in main.jsx) runs the
// state below once and useAuth() reads it from context. Per-component
// instances each started loading=true and re-ran the membership query, which
// made admin controls (Finance tab, Manage team, Delete all) flash in late on
// every load — and disappear entirely if one instance's query failed.
function useAuthState() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  // Monotonic guard: a late-resolving query must never overwrite state (or
  // the module-level org id) written by a newer auth event — e.g. an
  // in-flight load landing after sign-out.
  const seqRef = useRef(0)

  const loadMembership = useCallback(async (userId) => {
    const mySeq = ++seqRef.current
    if (!userId) {
      setMembership(null)
      setActiveOrgId(null)
      return
    }
    // The user_id filter is load-bearing: org admins' RLS lets them read every
    // membership in their org, so without it the top-ranked row could be a
    // teammate's. Highest own level wins; created_at breaks ties (matches the
    // Hub's active-org pick so both apps agree which org you're in).
    // `*` rather than named columns so a hub project that hasn't run the
    // 0007 migration yet (no can_add_expenses column) doesn't fail the query
    // and lock everyone out — the flag just reads as undefined.
    const { data, error } = await supabase
      .from('memberships')
      .select('*, organisations ( id, name )')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('access_level', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (mySeq !== seqRef.current) return // superseded by a newer auth event
    if (error) {
      console.error('[suite] membership load failed:', error.message)
      return // keep the previous state rather than flashing "no access"
    }
    setMembership(data || null)
    setActiveOrgId(data?.org_id || null)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadMembership(data.session?.user?.id)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      setSession(s)
      if (!s) {
        seqRef.current++ // invalidate any in-flight load
        setMembership(null)
        setActiveOrgId(null)
        return
      }
      // Defer the query out of the auth callback to avoid a documented
      // Supabase deadlock hazard. TOKEN_REFRESHED re-checks the membership —
      // it's the only signal an open tab gets that an admin changed their
      // level or deactivated them.
      if (_event === 'SIGNED_IN' || _event === 'USER_UPDATED' || _event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          if (active) loadMembership(s?.user?.id)
        }, 0)
      }
    })

    // The Hub lives on a DIFFERENT origin (ecofutures.uk vs jobs.…), so its
    // sign-out never reaches us via storage events or BroadcastChannel — the
    // cookie just silently disappears. Re-check it whenever this tab regains
    // focus so the gate drops instead of showing an app whose requests fail.
    const recheck = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (!data.session) {
        seqRef.current++
        setSession(null)
        setMembership(null)
        setActiveOrgId(null)
      }
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)

    return () => {
      active = false
      seqRef.current++
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
      sub.subscription.unsubscribe()
    }
  }, [loadMembership])

  const signOut = useCallback(() => supabase.auth.signOut(), [])
  const refresh = useCallback(() => loadMembership(session?.user?.id), [loadMembership, session])

  const accessLevel = membership?.access_level ?? 0

  return {
    configured: isSupabaseConfigured,
    session,
    user: session?.user || null,
    org: membership?.organisations || null,
    orgId: membership?.org_id || null,
    accessLevel,
    hasAccess: Boolean(membership),
    isAdmin: accessLevel >= 3,
    canDeleteJobs: accessLevel >= 2,
    // Levels 1–2 may log expenses only when an admin has flipped the
    // per-account flag (memberships.can_add_expenses, hub migration 0007).
    // RLS on biz_expenses checks the same flag — this only shapes the UI.
    canSubmitExpenses: accessLevel >= 3 || membership?.can_add_expenses === true,
    loading,
    signOut,
    refresh,
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const auth = useAuthState()
  return createElement(AuthContext.Provider, { value: auth }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth needs <AuthProvider> above it (see src/main.jsx)')
  return ctx
}
