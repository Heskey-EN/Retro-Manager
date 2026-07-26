import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { HUB_URL } from '../lib/supabaseClient'
import '../styles-admin.css'

// Wraps the app. Sign-in happens at the HUB (ecofutures.uk/retrofit-suite) —
// this app never shows its own login. The shared .ecofutures.uk cookie means
// arriving here already signed in Just Works; otherwise we point at the Hub.
// When Supabase isn't configured — e.g. plain local dev without keys — it
// passes straight through so the tool still runs on the local backend.
export default function AuthGate({ children }) {
  const auth = useAuth()

  // Signed in but not in an organisation yet: poll so the gate lifts
  // automatically once an admin adds them on the Hub.
  const awaitingOrg = auth.configured && auth.session && !auth.hasAccess
  useEffect(() => {
    if (!awaitingOrg) return undefined
    const id = setInterval(() => auth.refresh(), 15000)
    return () => clearInterval(id)
  }, [awaitingOrg, auth.refresh])

  if (!auth.configured) return children
  if (auth.loading) return <div className="admin__loading">Loading…</div>

  if (!auth.session) {
    return (
      <div className="auth">
        <div className="auth__card">
          <h1 className="auth__title">Sign in through the Retrofit Suite</h1>
          <p className="auth__note">
            The Job Manager uses your Eco Futures suite account — one login for every
            app. Sign in at the Hub, then come back to this tab (or open the Job
            Manager tile) and you'll be straight in.
          </p>
          <div className="auth__actions">
            <a className="btn btn--primary" href={`${HUB_URL}/retrofit-suite`}>
              Sign in at the Hub
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!auth.hasAccess) {
    return (
      <div className="auth">
        <div className="auth__card">
          <h1 className="auth__title">Almost there</h1>
          <p className="auth__note">
            You're signed in as <strong>{auth.user.email}</strong>, but you're not part
            of an organisation yet. Set one up on the Hub, or ask your admin to add
            you — this page checks again automatically.
          </p>
          <div className="auth__actions">
            <a className="btn btn--primary" href={`${HUB_URL}/retrofit-suite`}>
              Open the Retrofit Suite
            </a>
            <button className="btn" onClick={auth.signOut}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return children
}
