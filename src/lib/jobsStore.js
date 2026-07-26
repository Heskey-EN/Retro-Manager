import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getActiveOrgId } from './orgContext'
import { idbGetAll, idbGet, idbPut, idbBulkPut, idbClear } from './idb'

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
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: true })
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
      if (error) throw error
      return data
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
      const channel = supabase
        .channel('jobs-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLE },
          (payload) => onChange(payload),
        )
        .subscribe()
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
      const existing = await idbGet('jobs', id)
      if (!existing) return null
      const updated = { ...existing, ...patch, updated_at: new Date().toISOString() }
      await idbPut('jobs', updated)
      announce({ eventType: 'UPDATE', new: updated })
      return updated
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
