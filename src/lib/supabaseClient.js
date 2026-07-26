import { createBrowserClient } from '@supabase/ssr'

// This app is part of the Eco Futures Retrofit Suite. It does NOT have its
// own login — the session comes from the Hub (ecofutures.uk/retrofit-suite)
// via a cookie scoped to .ecofutures.uk, so signing in there signs you in
// here. The client below must therefore match the Hub's cookie config
// exactly (same name, same domain rule) — see EcoFutures/src/lib/hub/supabase.js.
//
// Env vars point at the HUB Supabase project (not a per-app project):
//   VITE_HUB_SUPABASE_URL, VITE_HUB_SUPABASE_ANON_KEY
// Optional: VITE_SUITE_HUB_URL overrides where "sign in" links point
// (defaults to https://ecofutures.uk; set http://localhost:5180 in local dev).

// Normalise the project URL: people often paste the REST endpoint
// (…supabase.co/rest/v1/) or leave a trailing slash, which makes the client
// build invalid paths like …/rest/v1/auth/v1/token ("Invalid path specified in
// request URL"). Strip a stray /rest/v1 or /auth/v1 and any trailing slash so
// only the base project URL is used.
function normalizeSupabaseUrl(u) {
  if (!u) return u
  return u.trim().replace(/\/(rest|auth)\/v1\/?$/i, '').replace(/\/+$/, '')
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_HUB_SUPABASE_URL)
const anonKey = import.meta.env.VITE_HUB_SUPABASE_ANON_KEY?.trim()

// The app still works without Supabase configured — the store falls back to a
// local (per-browser) backend so the tool runs in plain local dev.
export const isSupabaseConfigured = Boolean(url && anonKey)

// Where the Hub lives — used by sign-in links and the team-management button.
export const HUB_URL = (import.meta.env.VITE_SUITE_HUB_URL || 'https://ecofutures.uk').replace(/\/+$/, '')

const onSuiteDomain =
  typeof window !== 'undefined' &&
  /(^|\.)ecofutures\.uk$/i.test(window.location.hostname)

export const supabase = isSupabaseConfigured
  ? createBrowserClient(url, anonKey, {
      cookieOptions: {
        // MUST match the Hub exactly — this is what shares the session.
        name: 'ef-suite-auth',
        ...(onSuiteDomain ? { domain: '.ecofutures.uk' } : {}),
        path: '/',
        sameSite: 'lax',
        secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
      },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null
