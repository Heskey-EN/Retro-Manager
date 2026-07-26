// The Finance section — the whole Business Hub (calendar dashboard, finance,
// expenses, invoices) folded into RetroManager as one gated tab. Renders
// under the app topbar; FinanceGate decides who gets in (level 3+ in suite
// mode, the per-device passcode in local mode).

import { useRef, useState } from 'react'
import {
  LayoutDashboard, PoundSterling, Receipt, Settings, Lock, Download, Upload, Users,
} from 'lucide-react'
import FinanceGate, { lockHub } from './FinanceGate.jsx'
import { useHubData, updateSettings, exportBackup, importBackup, useCloudStatus } from './lib/store.js'
import { isSuiteConfigured } from './lib/supabaseClient.js'
import { useAuth } from '../hooks/useAuth.js'
import { useBizRoute, toHash } from './router.jsx'
import { Modal, Field, inputCls } from './components/ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Finance from './pages/Finance.jsx'
import Expenses from './pages/Expenses.jsx'
import InvoicePage from './pages/InvoicePage.jsx'
import TeamPermissionsModal from './components/TeamPermissionsModal.jsx'

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
        <button type="submit" className="btn-primary w-full rounded-lg">Save settings</button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Backup</div>
        <p className="mb-3 text-xs text-slate-500">
          {isSuiteConfigured
            ? 'Your business data is shared with your organisation in the cloud; only receipt photos stay on this device. A backup captures a full snapshot — restoring replaces the organisation’s shared data for everyone.'
            : 'Your finance data — including receipt photos — is stored in this browser. Download a backup regularly, and restore it here if you move device (this is also how you bring data over from the old Business Hub).'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => exportBackup()} className="btn-outline flex-1 rounded-lg !px-3 !py-2 !text-xs">
            <Download size={14} /> Download backup
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline flex-1 rounded-lg !px-3 !py-2 !text-xs">
            <Upload size={14} /> Restore backup
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
        </div>
        {importMsg && <p className="mt-2 text-xs font-semibold text-brand-blue">{importMsg}</p>}
      </div>
    </Modal>
  )
}

// Cloud save indicator (suite mode only): green = saved, amber = saving,
// red = a save failed and will retry on the next change.
function SyncChip() {
  const status = useCloudStatus()
  const cfg = {
    ready: { dot: 'bg-emerald-500', label: 'Saved' },
    syncing: { dot: 'bg-amber', label: 'Saving…' },
    loading: { dot: 'bg-amber', label: 'Loading…' },
    offline: { dot: 'bg-amber', label: 'Live sync offline' },
    error: { dot: 'bg-red-500', label: 'Save failed' },
  }[status]
  if (!cfg) return null
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
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

export default function BusinessSection() {
  const [showSettings, setShowSettings] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const route = useBizRoute() || { page: 'dashboard' }
  const { configured, isAdmin } = useAuth()

  return (
    <FinanceGate>
      <div className="biz font-sans text-ink">
        <div className="container-site pt-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className="flex items-center gap-1.5">
              {TABS.map(({ to, page, label, icon: Icon }) => {
                const active = route.page === page || (page === 'finance' && route.page === 'invoice')
                return (
                  <a
                    key={page}
                    href={toHash(to)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      active ? 'bg-navy text-white' : 'border border-slate-200 bg-white text-slate-500 hover:text-navy'
                    }`}
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
                <button
                  onClick={() => setShowTeam(true)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:text-navy"
                  title="Choose which team members can log expenses"
                >
                  <Users size={15} />
                  <span className="hidden sm:inline">Team expenses</span>
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-navy"
                title="Finance settings"
              >
                <Settings size={15} />
              </button>
              {!isSuiteConfigured && (
                <button
                  onClick={() => {
                    lockHub()
                    window.location.reload()
                  }}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-navy"
                  title="Lock the finance section"
                >
                  <Lock size={15} />
                </button>
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
            <Dashboard />
          )}
        </main>

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showTeam && <TeamPermissionsModal onClose={() => setShowTeam(false)} />}
      </div>
    </FinanceGate>
  )
}
