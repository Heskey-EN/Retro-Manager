// Gate for the Finance section (the merged-in Business Hub).
//   Suite mode (hub env vars set): business data is Organisation Admin
//     territory — access level 3+ only. RLS on biz_data enforces the same
//     server-side; this gate is just UX. The app-level AuthGate has already
//     handled signed-out / no-org states before we get here.
//   Local mode (no env vars): the tracker's original per-device passcode,
//     data in this browser's localStorage. Nothing changes for offline use.

import { useEffect, useState } from 'react'
import { Lock, Leaf, Loader2, CloudUpload } from 'lucide-react'
import {
  useHubData, updateSettings, initCloud, initTeamExpenses, cloudIsEmpty, localSnapshot, uploadLocalToCloud,
} from './lib/store.js'
import { isSuiteConfigured, HUB_URL } from './lib/supabaseClient.js'
import { useAuth } from '../hooks/useAuth.js'
import { inputCls } from './components/ui.jsx'
import { Button } from '../ui'

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ef-hub:${text}`))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function isUnlocked() {
  return sessionStorage.getItem('ef-hub-unlocked') === '1'
}

export function lockHub() {
  sessionStorage.removeItem('ef-hub-unlocked')
}

/* ── Shared card shell ───────────────────────────────────────────────── */

function GateShell({ children }) {
  return (
    // dvh: iOS resolves vh against the large viewport, so 60vh is taller than
    // 60% of what you can actually see while the address bar is up.
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up rounded-2xl border border-line bg-paper-card p-8 shadow-lift">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-accent-green">
            <Leaf size={22} />
          </span>
          <div>
            <div className="font-display text-lg font-bold leading-tight">Assessment Manager</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-faint">Finance</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Suite mode ──────────────────────────────────────────────────────── */

// "Start fresh instead" is remembered per org — without this the migration
// offer re-appeared on every visit for as long as the cloud blob stayed empty.
const migrationSkipKey = (orgId) => `ef-hub-migration-skip-${orgId}`

function CloudBoot({ orgId, children }) {
  // 'connecting' | 'offer-migration' | 'ready' | 'error'
  const [phase, setPhase] = useState('connecting')

  useEffect(() => {
    let active = true
    // Team-logged expenses load alongside the org blob; a failure there is
    // non-fatal (initTeamExpenses logs and carries on).
    Promise.all([initCloud(orgId), initTeamExpenses(orgId)])
      .then(() => {
        if (!active) return
        const local = localSnapshot()
        const s = local?.settings || {}
        const hasLocal = Boolean(
          local &&
            ((local.jobs || []).length ||
              (local.expenses || []).length ||
              (local.invoices || []).length ||
              // settings-only data (business name/address, invoice counter) still worth migrating
              s.businessAddress ||
              s.businessEmail ||
              s.businessPhone ||
              (s.nextInvoiceNo || 1) > 1),
        )
        const dismissed = localStorage.getItem(migrationSkipKey(orgId)) === '1'
        setPhase(cloudIsEmpty() && hasLocal && !dismissed ? 'offer-migration' : 'ready')
      })
      .catch(() => active && setPhase('error'))
    return () => {
      active = false
    }
  }, [orgId])

  if (phase === 'connecting') {
    return (
      <GateShell>
        <p className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 size={16} className="animate-spin" /> Connecting to your organisation…
        </p>
      </GateShell>
    )
  }

  if (phase === 'error') {
    return (
      <GateShell>
        <h1 className="mb-1 text-xl font-bold">Couldn't load your data</h1>
        <p className="mb-5 text-sm text-ink-faint">
          Something went wrong reaching the suite backend — check your connection and try again.
        </p>
        <Button tone="primary" onClick={() => window.location.reload()} className="w-full">
          Try again
        </Button>
      </GateShell>
    )
  }

  if (phase === 'offer-migration') {
    return (
      <GateShell>
        <h1 className="mb-1 text-xl font-bold">Move this device's data to your organisation?</h1>
        <p className="mb-5 text-sm text-ink-faint">
          This browser has tracker data from before the suite login (jobs, expenses,
          invoices). Upload it once and it becomes your organisation's shared data,
          available on every device. The copy on this device is kept as a backup.
        </p>
        <div className="space-y-2">
          <Button
            tone="primary"
            className="w-full"
            onClick={() => {
              uploadLocalToCloud()
              setPhase('ready')
            }}
          >
            <CloudUpload size={16} /> Upload this device's data
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              localStorage.setItem(migrationSkipKey(orgId), '1')
              setPhase('ready')
            }}
          >
            Start fresh instead
          </Button>
        </div>
      </GateShell>
    )
  }

  return children
}

function SuiteGate({ children }) {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <GateShell>
        <p className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 size={16} className="animate-spin" /> Checking your account…
        </p>
      </GateShell>
    )
  }

  // AuthGate normally catches these two before the Finance section renders —
  // they're kept as a belt-and-braces fallback.
  if (!auth.session || !auth.hasAccess) {
    return (
      <GateShell>
        <h1 className="mb-1 text-xl font-bold">Sign in through the Retrofit Suite</h1>
        <p className="mb-5 text-sm text-ink-faint">
          Finance uses your Eco Futures suite account. Sign in at the Hub, then come
          back to this tab and you'll be straight in.
        </p>
        <Button as="a" tone="primary" href={`${HUB_URL}/retrofit-suite`} className="w-full no-underline">
          <Lock size={16} /> Sign in at the Hub
        </Button>
      </GateShell>
    )
  }

  if (!auth.isAdmin) {
    return (
      <GateShell>
        <h1 className="mb-1 text-xl font-bold">Admins only</h1>
        <p className="mb-5 text-sm text-ink-faint">
          Business finances are only available to Organisation Admins. If you think
          you should have access, ask your admin.
        </p>
        <Button as="a" href="#/jobs" className="w-full no-underline">
          Back to your jobs
        </Button>
      </GateShell>
    )
  }

  return <CloudBoot orgId={auth.orgId}>{children}</CloudBoot>
}

/* ── Local mode (the original passcode gate, unchanged) ──────────────── */

function PasscodeGate({ children }) {
  const { settings } = useHubData()
  const [unlocked, setUnlocked] = useState(isUnlocked())
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const firstTime = !settings.passcodeHash

  if (unlocked) return children

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (firstTime) {
      if (code.length < 4) return setError('Passcode needs at least 4 characters.')
      if (code !== confirm) return setError('Passcodes don’t match.')
      updateSettings({ passcodeHash: await hash(code) })
    } else if ((await hash(code)) !== settings.passcodeHash) {
      return setError('Wrong passcode — try again.')
    }
    sessionStorage.setItem('ef-hub-unlocked', '1')
    setUnlocked(true)
  }

  return (
    <GateShell>
      <form onSubmit={submit}>
        <h1 className="mb-1 text-xl font-bold">{firstTime ? 'Set up your passcode' : 'Welcome back'}</h1>
        <p className="mb-5 text-sm text-ink-faint">
          {firstTime
            ? 'Choose a passcode to protect the finance section on this device.'
            : 'Enter your passcode to open the finance section.'}
        </p>

        <div className="space-y-3">
          <input
            type="password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={firstTime ? 'New passcode' : 'Passcode'}
            className={inputCls}
          />
          {firstTime && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm passcode"
              className={inputCls}
            />
          )}
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

        <Button type="submit" tone="primary" className="mt-5 w-full">
          <Lock size={16} />
          {firstTime ? 'Create & open' : 'Unlock'}
        </Button>
      </form>
    </GateShell>
  )
}

export default function FinanceGate({ children }) {
  if (isSuiteConfigured) {
    // Suite mode never uses the per-device passcode; clear any stale unlock
    // so it can't outlive a mode switch.
    sessionStorage.removeItem('ef-hub-unlocked')
    return <SuiteGate>{children}</SuiteGate>
  }
  return <PasscodeGate>{children}</PasscodeGate>
}
