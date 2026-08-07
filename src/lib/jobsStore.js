import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getActiveOrgId } from './orgContext'
import { idbGetAll, idbBulkPut, idbDelete, idbClear, idbUpdate } from './idb'

// A small uniform interface over two interchangeable backends:
//   - "supabase": a shared Postgres table with real-time Postgres changes,
//     giving true multi-user sync across all 40-50 users.
//   - "local": browser localStorage + BroadcastChannel, which syncs across
//     tabs on one machine so the app is fully usable before Supabase is set up.
//
// Components don't care which backend is active; they call the same methods and
// subscribe to the same change events.

const TABLE = 'jobs'

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/* -------------------------------------------------------------------------- */
/*  Supabase backend                                                          */
/* -------------------------------------------------------------------------- */

function createSupabaseStore() {
  return {
    mode: 'supabase',

    async fetchAll() {
      // Explicit org scoping on top of RLS: without it a level-4 master admin
      // (whose RLS read spans every organisation) would see all orgs' jobs
      // mixed into one list.
      const orgId = getActiveOrgId()
      let query = supabase.from(TABLE).select('*').order('created_at', { ascending: true })
      if (orgId) query = query.eq('org_id', orgId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },

    async insertMany(jobs) {
      // Every row belongs to the signed-in user's organisation; RLS verifies.
      const orgId = getActiveOrgId()
      if (!orgId) throw new Error('Your organisation is still loading — try again in a moment.')
      const rows = jobs.map((j) => ({ ...j, id: j.id || uuid(), org_id: orgId }))
      const { data, error } = await supabase.from(TABLE).insert(rows).select()
      if (error) throw error
      return data
    },

    async updateJob(id, patch) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        // PGRST204 = the column doesn't exist. The only optional column is
        // `assignments` (hub migration 0008), so say which SQL to run rather
        // than surfacing a raw PostgREST code.
        if (error.code === 'PGRST204' && 'assignments' in patch) {
          throw new Error(
            "Assignments need the hub database migration — run supabase/hub/0008_job_assignments.sql in the hub project's SQL editor.",
          )
        }
        throw error
      }
      return data
    },

    async deleteMany(ids) {
      if (!ids?.length) return
      const orgId = getActiveOrgId()
      let query = supabase.from(TABLE).delete().in('id', ids)
      if (orgId) query = query.eq('org_id', orgId)
      // .select() makes an RLS-filtered no-op visible: deleting below level 2
      // isn't an error, it just matches zero rows — without this the UI would
      // report success and the jobs would reappear on the next refetch.
      const { data, error } = await query.select('id')
      if (error) throw error
      const removed = data?.length || 0
      if (removed === 0) {
        throw new Error('You do not have permission to delete jobs — ask an admin.')
      }
      if (removed < ids.length) {
        throw new Error(`Only ${removed} of ${ids.length} jobs could be deleted — you may not have permission for the rest.`)
      }
    },

    async clearAll() {
      // Delete this organisation's jobs (RLS already scopes the delete to
      // rows the caller may touch; the explicit filter makes intent plain).
      const orgId = getActiveOrgId()
      if (!orgId) throw new Error('Your organisation is still loading — try again in a moment.')
      const { error } = await supabase.from(TABLE).delete().eq('org_id', orgId)
      if (error) throw error
    },

    subscribe(onChange) {
      // Server-side org filter for INSERT/UPDATE (DELETE events only carry the
      // pk, so they can't be filtered — the consumer ignores unknown ids).
      const orgId = getActiveOrgId()
      // Unique topic per subscriber — useJobs and the Finance job-sync both
      // subscribe, and two live channels must never share one Phoenix topic.
      const channel = supabase
        .channel(`jobs-changes-${Math.random().toString(36).slice(2, 9)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: TABLE,
            ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
          },
          (payload) => onChange(payload),
        )
        .subscribe((status) => {
          // postgres_changes has no replay: anything sent while the socket was
          // down (laptop asleep, network blip) is gone. Every (re)join is
          // therefore a "state unknown" moment — tell the consumer to reload
          // from the source of truth rather than staying silently stale.
          if (status === 'SUBSCRIBED') onChange({ eventType: 'SYNC' })
        })
      return () => supabase.removeChannel(channel)
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Local backend (IndexedDB + BroadcastChannel)                              */
/* -------------------------------------------------------------------------- */

function createLocalStore() {
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rmt:jobs') : null
  const announce = (payload) => channel?.postMessage(payload)

  return {
    mode: 'local',

    async fetchAll() {
      const rows = await idbGetAll('jobs')
      return rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    },

    async insertMany(jobs) {
      const now = new Date().toISOString()
      const rows = jobs.map((j, i) => ({
        ...j,
        id: j.id || uuid(),
        // Stagger timestamps so import order is preserved when sorting.
        created_at: new Date(Date.now() + i).toISOString(),
        updated_at: now,
      }))
      await idbBulkPut('jobs', rows)
      announce({ eventType: 'INSERT', new: rows })
      return rows
    },

    async updateJob(id, patch) {
      // One transaction, not get-then-put: two quick edits to the same job
      // (status tap, then a costing keystroke) used to interleave, and the
      // later write resurrected the row it had read before the earlier one
      // committed — the status change just vanished.
      const updated = await idbUpdate('jobs', id, (existing) => ({
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      }))
      if (!updated) return null
      announce({ eventType: 'UPDATE', new: updated })
      return updated
    },

    async deleteMany(ids) {
      if (!ids?.length) return
      for (const id of ids) await idbDelete('jobs', id)
      // Other tabs reload rather than patching row by row.
      announce({ eventType: 'SYNC' })
    },

    async clearAll() {
      await idbClear('jobs')
      await idbClear('documents')
      announce({ eventType: 'DELETE', new: null })
    },

    subscribe(onChange) {
      if (!channel) return () => {}
      const handler = (e) => onChange(e.data)
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
  }
}

export const jobsStore = isSupabaseConfigured ? createSupabaseStore() : createLocalStore()
export const storeMode = jobsStore.mode
