import { useMemo } from 'react'
import { STATUSES } from '../lib/status'

// The signature element: the retrofit workflow rendered as a connected pipeline.
// Each stage shows how many jobs sit in it; clicking a stage filters the views.
// Because the stages are a genuine sequence, the numbering and left-to-right
// flow encode real meaning, not decoration.
export default function Pipeline({ jobs, activeStatus, onSelect }) {
  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s.value, 0]))
    for (const job of jobs) if (map[job.status] != null) map[job.status] += 1
    return map
  }, [jobs])

  const max = Math.max(1, ...STATUSES.map((s) => counts[s.value]))

  return (
    <section className="pipeline" aria-label="Workflow pipeline">
      <header className="pipeline__head">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2 className="pipeline__title">Job pipeline</h2>
        </div>
        <button
          className={`pipeline__all${!activeStatus ? ' is-active' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className="pipeline__all-count">{jobs.length}</span>
          All jobs
        </button>
      </header>

      <ol className="pipeline__track">
        {STATUSES.map((s, i) => {
          const count = counts[s.value]
          const active = activeStatus === s.value
          return (
            <li key={s.value} className="pipeline__stage-wrap">
              <button
                className={`pipeline__stage${active ? ' is-active' : ''}`}
                style={{ '--status-color': s.color }}
                onClick={() => onSelect(active ? null : s.value)}
                aria-pressed={active}
              >
                <span className="pipeline__index">{String(i + 1).padStart(2, '0')}</span>
                <span className="pipeline__count">{count}</span>
                <span className="pipeline__label">{s.label}</span>
                <span className="pipeline__meter" aria-hidden>
                  <span
                    className="pipeline__meter-fill"
                    style={{ width: `${(count / max) * 100}%`, background: s.color }}
                  />
                </span>
              </button>
              {i < STATUSES.length - 1 && (
                <span className="pipeline__connector" aria-hidden>›</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
