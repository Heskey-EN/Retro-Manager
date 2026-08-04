import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Banner, Button, Modal, Mono, cx } from '../ui'
import { planImport } from '../lib/importMatch'
import { statusLabel } from '../lib/status'

// Shown before anything is written. An import that silently creates 21 jobs —
// half of them copies of jobs you already had — is worse than no import, so
// this says exactly what will happen and lets you drop either half of it.

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`

// Section headings are <h3>, and styles.css still sets `h1,h2,h3 { font-family:
// display }` unlayered — so they carry font-display rather than fighting it.
const headingCls = 'font-display text-xs font-bold uppercase text-ink-faint'
const listCls = 'divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line'
const rowCls = 'grid gap-1 px-3 py-2.5'
// A value the import will write, as a small chip. (The old rule painted these
// with var(--surface-2), which is defined nowhere — they have been transparent
// all along. sunken is the colour it was reaching for.)
const fillCls = 'rounded bg-sunken px-1.5 py-px text-[11px] text-ink-faint'

function ColumnSummary({ mapping }) {
  const sniffed = new Set(mapping.sniffed || [])
  const rows = [
    ['Address', mapping.addressCol, 'addressCol'],
    ['Postcode', mapping.postcodeCol, 'postcodeCol'],
    ['Date', mapping.startCol, 'startCol'],
    ['Price', mapping.priceCol, 'priceCol'],
    ['Stage', mapping.statusCol, 'statusCol'],
    ['Customer', mapping.customerCol, 'customerCol'],
    ['Reference', mapping.refCol, 'refCol'],
  ].filter(([, col]) => col)

  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map(([label, col, role]) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px]"
        >
          <span className="shrink-0 text-ink-faint">{label}</span>
          <Mono className="truncate text-ink">{col}</Mono>
          {sniffed.has(role) && (
            <span
              className="shrink-0 rounded bg-ember-wash px-1 font-mono text-[9.5px] uppercase tracking-wider text-ember-deep"
              title="Worked out from the data, not the header"
            >
              auto
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

// One of the three counts at the top. The first two are tick boxes that drop
// their half of the import; the third is just a reassurance and has none.
function Tally({ n, children, checked, disabled, onChange }) {
  const Tag = onChange ? 'label' : 'div'
  return (
    <Tag
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-xl border border-line bg-paper-card px-3 py-2.5 text-[13px]',
        onChange && !disabled ? 'cursor-pointer' : 'opacity-55',
      )}
    >
      {onChange && (
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-ember"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}
      <Mono className="text-lg font-bold">{n}</Mono>
      <span className="min-w-0">{children}</span>
    </Tag>
  )
}

export default function ImportReview({ parsed, existingJobs, onCancel, onApply }) {
  const { jobs, mapping, fileName } = parsed
  const plan = useMemo(() => planImport(jobs, existingJobs), [jobs, existingJobs])

  const [addNew, setAddNew] = useState(true)
  const [applyUpdates, setApplyUpdates] = useState(true)
  // Off by default: filling blanks is always safe, replacing what you already
  // have is not.
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // With overwrite on, jobs that had nothing to FILL but did disagree become
  // changes too.
  const conflictOnly = plan.unchanged.filter((u) => u.conflicts.length)
  const touched = overwrite ? [...plan.updates, ...conflictOnly] : plan.updates
  const conflictCount = [...plan.updates, ...conflictOnly].reduce((n, u) => n + u.conflicts.length, 0)

  const total = (addNew ? plan.created.length : 0) + (applyUpdates ? touched.length : 0)

  async function apply() {
    setBusy(true)
    setError('')
    try {
      await onApply({
        created: addNew ? plan.created : [],
        updates: applyUpdates ? touched : [],
        overwrite,
      })
    } catch (err) {
      setError(err?.message || 'Import failed.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Review this import"
      subtitle={fileName}
      size="lg"
      onClose={() => !busy && onCancel()}
      footer={
        <>
          {error && <Banner tone="danger" className="w-full">{error}</Banner>}
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button tone="primary" onClick={apply} disabled={busy || total === 0}>
            {busy ? 'Importing…' : total === 0 ? 'Nothing to do' : `Import ${total} change${total === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5">
        <ColumnSummary mapping={mapping} />

        <div className="grid gap-2 sm:grid-cols-3">
          <Tally
            n={plan.created.length}
            checked={addNew && plan.created.length > 0}
            disabled={!plan.created.length}
            onChange={setAddNew}
          >
            new job{plan.created.length === 1 ? '' : 's'} to add
          </Tally>
          <Tally
            n={touched.length}
            checked={applyUpdates && touched.length > 0}
            disabled={!touched.length}
            onChange={setApplyUpdates}
          >
            existing job{touched.length === 1 ? '' : 's'} to update
          </Tally>
          <Tally n={plan.unchanged.length - (overwrite ? conflictOnly.length : 0)}>already up to date</Tally>
        </div>

        {conflictCount > 0 && (
          <label
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3',
              overwrite ? 'border-ember bg-ember-wash' : 'border-line bg-paper-card',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-ember"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            <span className="grid min-w-0 gap-0.5 text-[13px]">
              <strong className="font-semibold">Use the file where it disagrees</strong>
              <span className="text-[11.5px] text-ink-faint">
                {overwrite
                  ? `Replacing ${conflictCount} value${conflictCount === 1 ? '' : 's'} already in the system with the file's.`
                  : `${conflictCount} value${conflictCount === 1 ? '' : 's'} differ. Left off, yours are kept.`}
              </span>
            </span>
          </label>
        )}

        {plan.dupesInFile.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <AlertTriangle size={13} className="shrink-0" /> {plan.dupesInFile.length} row
            {plan.dupesInFile.length === 1 ? ' repeats a property' : 's repeat properties'} already listed in the
            file — counted once.
          </p>
        )}

        {touched.length > 0 && (
          <section className="grid gap-1.5">
            <h3 className={headingCls}>
              {overwrite ? 'Jobs that will change' : 'Jobs that will gain missing details'}
            </h3>
            <ul className={cx(listCls, 'max-h-64')}>
              {touched.map((u) => (
                <li key={u.job.id} className={rowCls}>
                  <span className="text-[13px] font-semibold">{u.job.title}</span>
                  {/* Conflict-only entries (only reachable with overwrite on)
                      carry no fills, so this must tolerate an absent list. */}
                  {u.fills?.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {u.fills.map((f) => (
                        <span key={f.label} className={fillCls}>
                          {f.label} <strong className="font-semibold text-ink">{String(f.value)}</strong>
                        </span>
                      ))}
                    </span>
                  )}
                  {u.conflicts.length > 0 && (
                    <span className={cx('text-[11.5px]', overwrite ? 'text-ember-deep' : 'text-amber-deep')}>
                      {overwrite ? 'replacing: ' : 'kept yours: '}
                      {u.conflicts.map((c) => (
                        <span key={c.label}>
                          {c.label}{' '}
                          <strong className="font-semibold">{String(overwrite ? c.theirs : c.mine)}</strong>{' '}
                          ({overwrite ? `was ${String(c.mine)}` : `file says ${String(c.theirs)}`}){' '}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {conflictOnly.length > 0 && !overwrite && (
          <section className="grid gap-1.5">
            <h3 className={headingCls}>Already in the system, but the file disagrees</h3>
            <ul className={cx(listCls, 'max-h-64')}>
              {conflictOnly.map((u) => (
                <li key={u.job.id} className={rowCls}>
                  <span className="text-[13px] font-semibold">{u.job.title}</span>
                  <span className="text-[11.5px] text-amber-deep">
                    {u.conflicts.map((c) => (
                      <span key={c.label}>
                        {c.label}: yours <strong className="font-semibold">{String(c.mine)}</strong>, file{' '}
                        <strong className="font-semibold">{String(c.theirs)}</strong>{' '}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-faint">
              Nothing here is changed — tick “Use the file where it disagrees” above if the file is right.
            </p>
          </section>
        )}

        {plan.created.length > 0 && (
          <section className="grid gap-1.5">
            <h3 className={headingCls}>New jobs</h3>
            <ul className={cx(listCls, 'max-h-64')}>
              {plan.created.slice(0, 60).map((j, i) => (
                <li key={i} className={rowCls}>
                  <span className="text-[13px] font-semibold">{j.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {j.postcode && <Mono className={fillCls}>{j.postcode}</Mono>}
                    {j.start_date && <span className={fillCls}>{j.start_date}</span>}
                    {j.costing?.revenue > 0 && <span className={fillCls}>{money(j.costing.revenue)}</span>}
                    <span className={fillCls}>{statusLabel(j.status)}</span>
                  </span>
                </li>
              ))}
              {plan.created.length > 60 && (
                <li className={cx(rowCls, 'text-xs text-ink-faint')}>…and {plan.created.length - 60} more</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
