import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { Button, EmptyState, cx } from '../ui'
import { fromISO } from '../lib/dates.js'
import { inkOn } from './entries.js'

// The Gantt view: the only one that shows a multi-day run AS a run.
//
// Ported from components/CalendarTimeline.jsx when the calendars merged — same
// geometry, same scroll behaviour, now driven by calendar entries so Finance's
// company blocks appear as bars too. It lives inside its own overflow-x-auto,
// so however wide the track gets it can never push the page sideways.

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_WIDTH = 36
// The property column is 240px on a desktop and 140px on a phone: at 375px the
// wide one left barely three days of timeline visible beside it.
const LABEL_W = 240
const LABEL_W_SM = 140

const daysBetween = (a, b) => Math.round((b - a) / DAY_MS)

export default function Timeline({ entries, onOpenJob, onOpenEntry }) {
  const model = useMemo(() => {
    const dated = entries
      .map((e) => ({ e, start: fromISO(e.start), end: fromISO(e.end) }))
      .sort((a, b) => a.start - b.start)
    if (!dated.length) return null

    let min = dated[0].start
    let max = dated[0].end
    for (const d of dated) {
      if (d.start < min) min = d.start
      if (d.end > max) max = d.end
    }
    min = new Date(min.getTime() - DAY_MS)
    max = new Date(max.getTime() + DAY_MS)
    const totalDays = daysBetween(min, max) + 1
    const days = Array.from({ length: totalDays }, (_, i) => new Date(min.getTime() + i * DAY_MS))

    const months = []
    for (const day of days) {
      const label = day.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      const last = months[months.length - 1]
      if (last && last.label === label) last.span += 1
      else months.push({ label, span: 1 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayOffset = today >= min && today <= max ? daysBetween(min, today) : null

    return { dated, min, totalDays, days, months, todayOffset }
  }, [entries])

  const scrollRef = useRef(null)
  const [labelW, setLabelW] = useState(LABEL_W)

  // Width is read in JS (bars are absolutely positioned from it), so the
  // breakpoint has to live here rather than in a media query.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setLabelW(mq.matches ? LABEL_W_SM : LABEL_W)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Put "today" a third of the way across the DATES, not the whole box. The
  // property column sits over the track (it is sticky), so measuring from the
  // left edge of the scroller parked today underneath it on a phone, where the
  // column is 140 of about 335 visible pixels.
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current
    if (!el || !model || model.todayOffset == null) return
    const target = model.todayOffset * DAY_WIDTH - (el.clientWidth - labelW) / 3
    el.scrollLeft = Math.max(0, target)
  }, [model, labelW])

  // Auto-scroll to today on mount and whenever today's column actually moves —
  // but NOT on every unrelated job edit (which would discard the user's manual
  // scroll). Depending on the primitive todayOffset instead of the whole model.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToToday() }, [model?.todayOffset, labelW])

  if (!model) {
    return <EmptyState>Nothing dated to show. Add start dates to see work on the timeline.</EmptyState>
  }

  const trackWidth = model.totalDays * DAY_WIDTH
  const labelCls =
    'sticky left-0 flex shrink-0 flex-col justify-center gap-px border-r border-line bg-paper-card px-3 py-2 sm:px-4'

  return (
    <div>
      <div className="px-4 pb-3">
        <Button size="sm" onClick={scrollToToday} disabled={model.todayOffset == null}>
          <CalendarCheck size={15} aria-hidden /> Today
        </Button>
      </div>

      <div className="overflow-x-auto" ref={scrollRef}>
        <div className="relative" style={{ width: trackWidth + labelW }}>
          <div className="sticky top-0 z-[5] flex border-y border-line bg-paper-card">
            <div className={cx(labelCls, 'font-display text-[13px] font-semibold')} style={{ width: labelW }}>
              Property
            </div>
            <div className="shrink-0" style={{ width: trackWidth }}>
              <div className="flex">
                {model.months.map((m, i) => (
                  <div
                    key={i}
                    className="overflow-hidden whitespace-nowrap border-r border-line px-2.5 py-1.5 font-display text-xs font-semibold text-ink-soft"
                    style={{ width: m.span * DAY_WIDTH }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="flex">
                {model.days.map((d, i) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div
                      key={i}
                      className={cx(
                        'shrink-0 border-r border-sunken py-1 text-center font-mono text-[11px] tabular-nums text-ink-faint',
                        weekend && 'bg-sunken',
                      )}
                      style={{ width: DAY_WIDTH }}
                    >
                      {d.getDate()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="relative">
            {model.days.map((d, i) => (
              (d.getDay() === 0 || d.getDay() === 6) && (
                <div
                  key={`wk-${i}`}
                  className="pointer-events-none absolute inset-y-0 z-0 bg-sunken"
                  style={{ left: labelW + i * DAY_WIDTH, width: DAY_WIDTH }}
                />
              )
            ))}
            {model.todayOffset != null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-[1] w-0.5 bg-ember"
                style={{ left: labelW + model.todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                title="Today"
              />
            )}
            {model.dated.map(({ e, start, end }) => {
              const offset = daysBetween(model.min, start)
              const span = Math.max(1, daysBetween(start, end) + 1)
              const biz = e.kind === 'biz'
              return (
                <div key={e.id} className="group relative z-[2] flex h-11 border-b border-line hover:bg-sunken">
                  {/* The name stays put while the dates scroll under it —
                      without this a bar three months out belongs to nobody. */}
                  <div className={cx(labelCls, 'z-[3] group-hover:bg-sunken')} style={{ width: labelW }}>
                    <span className={cx('truncate text-[13px] font-medium', e.cancelled && 'text-ink-mute line-through')} title={e.title}>
                      {e.title}
                    </span>
                    {e.subtitle && <span className="truncate text-[11px] text-ink-faint">{e.subtitle}</span>}
                  </div>
                  <div className="relative shrink-0" style={{ width: trackWidth }}>
                    <button
                      type="button"
                      className={cx(
                        'absolute top-2 flex h-7 items-center overflow-hidden whitespace-nowrap rounded-[7px] px-2.5 text-xs',
                        'shadow-hairline transition-[filter] hover:brightness-110',
                        e.cancelled && 'opacity-55',
                      )}
                      style={{
                        left: offset * DAY_WIDTH,
                        width: span * DAY_WIDTH - 5,
                        // Jobs are solid, Finance entries outlined — Done and
                        // Company Work are the same amber, so fill alone would
                        // make them indistinguishable.
                        backgroundColor: biz ? `color-mix(in srgb, ${e.colour} 16%, #FBFCFD)` : e.colour,
                        color: biz ? `color-mix(in srgb, ${e.colour} 72%, #16202B)` : inkOn(e.colour),
                        boxShadow: biz ? `inset 0 0 0 1.5px ${e.colour}` : undefined,
                      }}
                      onClick={() => (biz ? onOpenEntry?.(e) : onOpenJob?.(e.source))}
                      title={`${e.title} — ${e.statusLabel}`}
                    >
                      <span className={cx('truncate font-medium', e.cancelled && 'line-through')}>{e.title}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
