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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const total = (addNew ? plan.created.length : 0) + (applyUpdates ? plan.updates.length : 0)

  async function apply() {
    setBusy(true)
    setError('')
    try {
      await onApply({
        created: addNew ? plan.created : [],
        updates: applyUpdates ? plan.updates : [],
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
            <label className={`importrev__tally${plan.updates.length ? '' : ' is-empty'}`}>
              <input
                type="checkbox" checked={applyUpdates && plan.updates.length > 0}
                disabled={!plan.updates.length}
                onChange={(e) => setApplyUpdates(e.target.checked)}
              />
              <span className="importrev__tally-n">{plan.updates.length}</span>
              <span>existing job{plan.updates.length === 1 ? '' : 's'} to top up</span>
            </label>
            <span className="importrev__tally is-empty">
              <span className="importrev__tally-n">{plan.unchanged.length}</span>
              <span>already up to date</span>
            </span>
          </div>

          {plan.dupesInFile.length > 0 && (
            <p className="importrev__note">
              <Icon name="alert" size={13} /> {plan.dupesInFile.length} row
              {plan.dupesInFile.length === 1 ? ' repeats a property' : 's repeat properties'} already listed in the
              file — counted once.
            </p>
          )}

          {plan.updates.length > 0 && (
            <section className="importrev__section">
              <h3 className="importrev__h">Jobs that will gain missing details</h3>
              <ul className="importrev__list">
                {plan.updates.map((u) => (
                  <li key={u.job.id} className="importrev__row">
                    <span className="importrev__row-title">{u.job.title}</span>
                    <span className="importrev__fills">
                      {u.fills.map((f) => (
                        <span key={f.label} className="importrev__fill">
                          {f.label} <strong>{String(f.value)}</strong>
                        </span>
                      ))}
                    </span>
                    {u.conflicts.length > 0 && (
                      <span className="importrev__conflicts">
                        kept yours:{' '}
                        {u.conflicts.map((c) => (
                          <span key={c.label}>
                            {c.label} <strong>{String(c.mine)}</strong> (file says {String(c.theirs)}){' '}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.unchanged.some((u) => u.conflicts.length) && (
            <section className="importrev__section">
              <h3 className="importrev__h">Already in the system, but the file disagrees</h3>
              <ul className="importrev__list">
                {plan.unchanged.filter((u) => u.conflicts.length).map((u) => (
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
              <p className="importrev__note">Nothing here is changed — edit the job if the file is right.</p>
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
