import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/60 p-4 pt-10 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} animate-fade-up rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

// text-base (16px) is deliberate: iOS Safari zooms the whole page whenever a
// focused input's font-size is under 16px, which makes every form on a phone
// feel broken.
export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue'

export function StatCard({ label, value, sub, accent = 'text-navy' }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper-card p-4 shadow-card">
      <div className="spec text-ink-faint">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>}
    </div>
  )
}

export function StatusChip({ status }) {
  const styles = {
    booked: 'bg-ember/[0.08] text-ember-deep border-ember/25',
    done: 'bg-amber/[0.12] text-amber-deep border-amber/30',
    paid: 'bg-moss/[0.10] text-moss-deep border-moss/30',
    draft: 'bg-ink/[0.06] text-ink-soft border-ink/15',
    sent: 'bg-amber/[0.12] text-amber-deep border-amber/30',
  }
  const labels = { booked: 'Booked', done: 'Done — unpaid', paid: 'Paid', draft: 'Draft', sent: 'Sent' }
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  )
}
