// Supabase Edge Function: admin-create-user
//
// Lets an admin create a new user account. Runs on the server so the
// service-role key never touches the browser. Flow:
//   1. Verify the caller's JWT and that their profile role is 'admin'.
//   2. Use the service-role client to create a confirmed user.
//   3. Set that user's profile role + active status.
//
// Deploy: Supabase dashboard → Edge Functions → create "admin-create-user" →
// paste this → Deploy. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are provided automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Always 200 with an { ok } flag so the client can read the result simply.
const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
const fail = (error: string) => reply({ ok: false, error })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail('Method not allowed')

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Identify the caller from their JWT and confirm they're an admin.
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return fail('Not signed in')

    const { data: me } = await caller.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return fail('Admins only')

    // 2. Create the user with the service-role key.
    const { email, password, full_name, role } = await req.json()
    if (!email || !password) return fail('Email and password are required')
    if (String(password).length < 6) return fail('Password must be at least 6 characters')
    const wantedRole = ['admin', 'member', 'viewer'].includes(role) ? role : 'member'

    const admin = createClient(url, serviceKey)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })
    if (createErr) return fail(createErr.message)

    // 3. Set their role and activate them (the signup trigger made the row).
    await admin.from('profiles').upsert({
      id: created.user.id,
      email,
      full_name: full_name ?? '',
      role: wantedRole,
      status: 'active',
    })

    return reply({ ok: true, id: created.user.id, email })
  } catch (e) {
    return fail((e as Error)?.message ?? String(e))
  }
})
