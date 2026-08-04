// The Finance section — the whole Business Hub (calendar dashboard, finance,
// expenses, invoices) folded into Assessment Manager as one gated tab. Renders
// under the app topbar; FinanceGate decides who gets in (level 3+ in suite
// mode, the per-device passcode in local mode).

import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, PoundSterling, Receipt, Settings, Lock, Download, Upload, Users,
} from 'lucide-react'
import FinanceGate, { lockHub } from './FinanceGate.jsx'
import { useHubData, updateSettings, exportBackup, importBackup, useCloudStatus } from './lib/store.js'
import { initManagerLink } from './lib/managerLink.js'
import { isSuiteConfigured } from './lib/supabaseClient.js'
import { useAuth } from '../hooks/useAuth.js'
import { useBizRoute, toHash } from './router.jsx'
import { Modal, Field, inputCls } from './components/ui.jsx'
import { Button, IconButton, cx, focusRing } from '../ui'
import Dashboard from './pages/Dashboard.jsx'
import Finance from './pages/Finance.jsx'
import Expenses from './pages/Expenses.jsx'
import InvoicePage from './pages/InvoicePage.jsx'
import TeamPermissionsModal from './components/TeamPermissionsModal.jsx'
import CleanupDuplicates from './components/CleanupDuplicates.jsx'

function SettingsModal({ onClose }) {
  const { settings } = useHubData()
  const [form, setForm] = useState({
    businessName: settings.businessName || '',
    businessAddress: settings.businessAddress || '',
    businessEmail: settings.businessEmail || '',
    businessPhone: settings.businessPhone || '',
    invoicePrefix: settings.invoicePrefix || 'EF-',
  })
  const fileRef = useRef(null)
  const [importMsg, setImportMsg] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function save(e) {
    e.preventDefault()
    updateSettings(form)
    onClose()
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // In cloud mode a restore replaces the WHOLE organisation's shared data,
    // not just this device — make that explicit before proceeding.
    if (
      isSuiteConfigured &&
      !window.confirm(
        'Restoring will replace your organisation’s shared business data — for every admin, on every device — with this backup file. Continue?',
      )
    ) {
      e.target.value = ''
      return
    }
    try {
      await importBackup(await file.text())
      setImportMsg('Backup restored ✔')
    } catch (err) {
      setImportMsg(`Import failed: ${err.message}`)
    }
    e.target.value = ''
  }

  return (
    <Modal title="Finance settings" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Business name">
          <input className={inputCls} value={form.businessName} onChange={set('businessName')} />
        </Field>
        <Field label="Business address (shown on invoices)">
          <textarea className={inputCls} rows={2} value={form.businessAddress} onChange={set('businessAddress')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input className={inputCls} value={form.businessEmail} onChange={set('businessEmail')} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.businessPhone} onChange={set('businessPhone')} />
          </Field>
        </div>
        <Field label="Invoice number prefix">
          <input className={inputCls} value={form.invoicePrefix} onChange={set('invoicePrefix')} />
        </Field>
        <Button type="submit" tone="primary" className="w-full">Save settings</Button>
      </form>

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Backup</div>
        <p className="mb-3 text-xs text-ink-faint">
          {isSuiteConfigured
            ? 'Your business data is shared with your organisation in the cloud; only receipt photos stay on this device. A backup captures a full snapshot — restoring replaces the organisation’s shared data for everyone.'
            : 'Your finance data — including receipt photos — is stored in this browser. Download a backup regularly, and restore it here if you move device (this is also how you bring data over from the old Business Hub).'}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => exportBackup()} className="flex-1">
            <Download size={14} /> Download backup
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} className="flex-1">
            <Upload size={14} /> Restore backup
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
        </div>
        {importMsg && <p className="mt-2 text-xs font-semibold text-ember-deep">{importMsg}</p>}
      </div>

      <CleanupDuplicates />
    </Modal>
  )
}

// Cloud save indicator (suite mode only): green = saved, amber = saving,
// red = a save failed and will retry on the next change.
function SyncChip() {
  const status = useCloudStatus()
  const cfg = {
    ready: { dot: 'bg-moss', label: 'Saved' },
    syncing: { dot: 'bg-amber', label: 'Saving…' },
    loading: { dot: 'bg-amber', label: 'Loading…' },
    offline: { dot: 'bg-amber', label: 'Live sync offline' },
    error: { dot: 'bg-danger', label: 'Save failed' },
  }[status]
  if (!cfg) return null
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-line bg-paper-card px-2.5 py-1 text-[11px] font-semibold text-ink-faint"
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

const TABS = [
  { to: '/', page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/finance', page: 'finance', label: 'Finance', icon: PoundSterling },
  { to: '/expenses', page: 'expenses', label: 'Expenses', icon: Receipt },
]

// `jobs` and `onOpenJob` come from App and are for the Dashboard's calendar
// only — it shows the real jobs list now, not just the rows Finance derives
// from their costing. Everything else in here still reads the business store.
export default function BusinessSection({ jobs = [], onOpenJob }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const route = useBizRoute() || { page: 'dashboard' }
  const { configured, isAdmin } = useAuth()

  // Pull the Jobs tab's costed jobs into Finance (revenue → income, cost
  // items → expenses) and follow live changes. Re-runs on every open so
  // local-mode edits made on the Jobs tab are picked up.
  useEffect(() => {
    initManagerLink()
  }, [])

  return (
    <FinanceGate>
      <div className="biz font-sans text-ink">
        <div className="container-site pt-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Sub-nav within Finance. Anchors, not buttons — same rule as the
                app's section tabs: anything that changes the URL must be
                openable in a new tab. 44px tall so a thumb can hit them. */}
            <nav className="flex items-center gap-1.5">
              {TABS.map(({ to, page, label, icon: Icon }) => {
                const active = route.page === page || (page === 'finance' && route.page === 'invoice')
                return (
                  <a
                    key={page}
                    href={toHash(to)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                      'no-underline transition-colors',
                      active
                        ? 'border-navy bg-navy text-white'
                        : 'border-line-strong bg-paper-card text-ink-faint hover:border-ink-faint hover:text-ink',
                      focusRing,
                    )}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{label}</span>
                  </a>
                )
              })}
            </nav>
            <div className="flex items-center gap-1.5">
              {isSuiteConfigured && <SyncChip />}
              {configured && isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setShowTeam(true)}
                  className="rounded-full"
                  title="Choose which team members can log expenses"
                >
                  <Users size={15} />
                  <span className="hidden sm:inline">Team expenses</span>
                </Button>
              )}
              <IconButton
                size="sm"
                label="Finance settings"
                onClick={() => setShowSettings(true)}
                className="rounded-full border-line-strong bg-paper-card"
              >
                <Settings size={15} />
              </IconButton>
              {!isSuiteConfigured && (
                <IconButton
                  size="sm"
                  label="Lock the finance section"
                  onClick={() => {
                    lockHub()
                    window.location.reload()
                  }}
                  className="rounded-full border-line-strong bg-paper-card"
                >
                  <Lock size={15} />
                </IconButton>
              )}
            </div>
          </div>
        </div>

        <main className="container-site py-5 pb-16 print:max-w-none print:p-0">
          {route.page === 'invoice' ? (
            <InvoicePage />
          ) : route.page === 'finance' ? (
            <Finance />
          ) : route.page === 'expenses' ? (
            <Expenses />
          ) : (
            <Dashboard jobs={jobs} onOpenJob={onOpenJob} />
          )}
        </main>

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showTeam && <TeamPermissionsModal onClose={() => setShowTeam(false)} />}
      </div>
    </FinanceGate>
  )
}
