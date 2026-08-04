import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { HUB_URL } from '../lib/supabaseClient'
import { Button, Card } from '../ui'

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
  if (auth.loading) return <div className="grid min-h-[60vh] place-items-center text-ink-faint">Loading…</div>

  if (!auth.session) {
    return (
      <GateShell title="Sign in through the Retrofit Suite">
        <p>
          Assessment Manager uses your Eco Futures suite account — one login for every
          app. Sign in at the Hub, then come back to this tab (or open the Assessment
          Manager tile) and you'll be straight in.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button as="a" tone="primary" href={`${HUB_URL}/retrofit-suite`}>
            Sign in at the Hub
          </Button>
        </div>
      </GateShell>
    )
  }

  if (!auth.hasAccess) {
    return (
      <GateShell title="Almost there">
        <p>
          You're signed in as <strong className="font-semibold text-ink">{auth.user.email}</strong>, but
          you're not part of an organisation yet. Set one up on the Hub, or ask your admin to add
          you — this page checks again automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button as="a" tone="primary" href={`${HUB_URL}/retrofit-suite`}>
            Open the Retrofit Suite
          </Button>
          <Button onClick={auth.signOut}>Sign out</Button>
        </div>
      </GateShell>
    )
  }

  return children
}

// The only screen a signed-out visitor sees, so it carries the app's card
// recipe rather than a one-off — it is the first impression of the whole tool.
function GateShell({ title, children }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper p-5">
      <Card pad={false} className="flex w-full max-w-md flex-col gap-4 p-6 text-sm leading-relaxed text-ink-faint shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {children}
      </Card>
    </div>
  )
}
