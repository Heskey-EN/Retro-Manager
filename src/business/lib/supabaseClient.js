// The business section shares the app's ONE hub Supabase client — same
// cookie, same session, same org. The tracker code was written against a
// module with these names (isSuiteConfigured), so this shim re-exports the
// app client under them rather than duplicating a client.
export { supabase, isSupabaseConfigured as isSuiteConfigured, HUB_URL } from '../../lib/supabaseClient.js'
