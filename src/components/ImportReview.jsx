import { useMemo, useState } from 'react'
import Icon from './Icon'
import { planImport } from '../lib/importMatch'
import { statusLabel } from '../lib/status'

// Shown before anything is written. An import that silently creates 21 jobs —
// half of them copies of jobs you already had — is worse than no import, so
// this says exactly what will happen and lets you drop either half of it.

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`

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
    <div className="importrev__cols">
      {rows.map(([label, col, role]) => (
        <span key={label} className="importrev__col">
          <span className="importrev__col-label">{label}</span>
          <span className="importrev__col-name">{col}</span>
          {sniffed.has(role) && <span className="importrev__guess" title="Worked out from the data, not the header">auto</span>}
        </span>
      ))}
    </div>
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
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal modal--tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Review import">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{fileName}</p>
            <h2 className="modal__title">Review this import</h2>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="importrev__body">
          <ColumnSummary mapping={mapping} />

          <div className="importrev__tallies">
            <label className={`importrev__tally${plan.created.length ? '' : ' is-empty'}`}>
              <input
                type="checkbox" checked={addNew && plan.created.length > 0}
                disabled={!plan.created.length}
                onChange={(e) => setAddNew(e.target.checked)}
              />
              <span className="importrev__tally-n">{plan.created.length}</span>
              <span>new job{plan.created.length === 1 ? '' : 's'} to add</span>
            </label>
            <label className={`importrev__tally${touched.length ? '' : ' is-empty'}`}>
              <input
                type="checkbox" checked={applyUpdates && touched.length > 0}
                disabled={!touched.length}
                onChange={(e) => setApplyUpdates(e.target.checked)}
              />
              <span className="importrev__tally-n">{touched.length}</span>
              <span>existing job{touched.length === 1 ? '' : 's'} to update</span>
            </label>
            <span className="importrev__tally is-empty">
              <span className="importrev__tally-n">{plan.unchanged.length - (overwrite ? conflictOnly.length : 0)}</span>
              <span>already up to date</span>
            </span>
          </div>

          {conflictCount > 0 && (
            <label className={`importrev__overwrite${overwrite ? ' is-on' : ''}`}>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span>
                <strong>Use the file where it disagrees</strong>
                <span className="importrev__overwrite-note">
                  {overwrite
                    ? `Replacing ${conflictCount} value${conflictCount === 1 ? '' : 's'} already in the system with the file's.`
                    : `${conflictCount} value${conflictCount === 1 ? '' : 's'} differ. Left off, yours are kept.`}
                </span>
              </span>
            </label>
          )}

          {plan.dupesInFile.length > 0 && (
            <p className="importrev__note">
              <Icon name="alert" size={13} /> {plan.dupesInFile.length} row
              {plan.dupesInFile.length === 1 ? ' repeats a property' : 's repeat properties'} already listed in the
              file — counted once.
            </p>
          )}

          {touched.length > 0 && (
            <section className="importrev__section">
              <h3 className="importrev__h">
                {overwrite ? 'Jobs that will change' : 'Jobs that will gain missing details'}
              </h3>
              <ul className="importrev__list">
                {touched.map((u) => (
                  <li key={u.job.id} className="importrev__row">
                    <span className="importrev__row-title">{u.job.title}</span>
                    {/* Conflict-only entries (only reachable with overwrite on)
                        carry no fills, so this must tolerate an absent list. */}
                    {u.fills?.length > 0 && (
                      <span className="importrev__fills">
                        {u.fills.map((f) => (
                          <span key={f.label} className="importrev__fill">
                            {f.label} <strong>{String(f.value)}</strong>
                          </span>
                        ))}
                      </span>
                    )}
                    {u.conflicts.length > 0 && (
                      <span className={`importrev__conflicts${overwrite ? ' is-overwriting' : ''}`}>
                        {overwrite ? 'replacing: ' : 'kept yours: '}
                        {u.conflicts.map((c) => (
                          <span key={c.label}>
                            {c.label}{' '}
                            <strong>{String(overwrite ? c.theirs : c.mine)}</strong>{' '}
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
            <section className="importrev__section">
              <h3 className="importrev__h">Already in the system, but the file disagrees</h3>
              <ul className="importrev__list">
                {conflictOnly.map((u) => (
                  <li key={u.job.id} className="importrev__row">
                    <span className="importrev__row-title">{u.job.title}</span>
                    <span className="importrev__conflicts">
                      {u.conflicts.map((c) => (
                        <span key={c.label}>
                          {c.label}: yours <strong>{String(c.mine)}</strong>, file <strong>{String(c.theirs)}</strong>{' '}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="importrev__note">
                Nothing here is changed — tick “Use the file where it disagrees” above if the file is right.
              </p>
            </section>
          )}

          {plan.created.length > 0 && (
            <section className="importrev__section">
              <h3 className="importrev__h">New jobs</h3>
              <ul className="importrev__list">
                {plan.created.slice(0, 60).map((j, i) => (
                  <li key={i} className="importrev__row">
                    <span className="importrev__row-title">{j.title}</span>
                    <span className="importrev__fills">
                      {j.postcode && <span className="importrev__fill mono">{j.postcode}</span>}
                      {j.start_date && <span className="importrev__fill">{j.start_date}</span>}
                      {j.costing?.revenue > 0 && <span className="importrev__fill">{money(j.costing.revenue)}</span>}
                      <span className="importrev__fill">{statusLabel(j.status)}</span>
                    </span>
                  </li>
                ))}
                {plan.created.length > 60 && (
                  <li className="importrev__row importrev__more">…and {plan.created.length - 60} more</li>
                )}
              </ul>
            </section>
          )}
        </div>

        {error && <p className="modal__error" style={{ color: 'var(--danger)', padding: '0 24px' }}>{error}</p>}

        <footer className="importrev__foot">
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn--primary" onClick={apply} disabled={busy || total === 0}>
            {busy ? 'Importing…' : total === 0 ? 'Nothing to do' : `Import ${total} change${total === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
