import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Mono, cx, focusRing } from '../ui'
import { gbp } from '../business/lib/store.js'
import { fmtDayMonth, fmtShort } from '../lib/dates.js'
import { amountOn } from './entries.js'

// One line of the calendar, shared by the day sheet and the "Next up" list so
// a booking reads identically wherever you meet it.

// Jobs are a filled circle, Finance entries a hollow square.
//
// Not decoration: Done is #e8b23a and Company Work is #E8B23A — the same
// amber. Colour alone cannot tell you which you are looking at, so the shape
// and the fill do.
export function Swatch({ entry, size = 10 }) {
  const biz = entry.kind === 'biz'
  return (
    <span
      aria-hidden
      className={cx('shrink-0', biz ? 'rounded-[2px]' : 'rounded-full')}
      style={{
        height: size,
        width: size,
        backgroundColor: biz ? 'transparent' : entry.colour,
        boxShadow: biz ? `inset 0 0 0 2px ${entry.colour}` : undefined,
        opacity: entry.cancelled ? 0.45 : 1,
      }}
    />
  )
}

export function EntryRow({ entry, iso, showMoney, onOpenJob, onOpenEntry, showDate = false }) {
  // Finance entries are read-only outside Finance: expanding in place shows
  // everything without handing a write path to a section whose gate (the local
  // -mode passcode) was never crossed. It is an addition — they were invisible
  // outside Finance before — not a removal.
  const [open, setOpen] = useState(false)
  const editable = entry.kind === 'job' || Boolean(onOpenEntry)
  const money = amountOn(entry, iso || entry.start)
  const b = entry.source

  const activate = () => {
    if (entry.kind === 'job') onOpenJob?.(entry.source)
    else if (onOpenEntry) onOpenEntry(entry)
    else setOpen((v) => !v)
  }

  return (
    <li>
      <button
        type="button"
        onClick={activate}
        aria-expanded={editable ? undefined : open}
        className={cx(
          'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-sunken',
          focusRing,
        )}
      >
        <Swatch entry={entry} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cx(
                'min-w-0 flex-1 truncate text-sm font-semibold',
                entry.cancelled ? 'text-ink-mute line-through' : 'text-ink',
              )}
            >
              {entry.title}
            </span>
            {entry.time && <Mono className="shrink-0 text-xs text-ink-faint">{entry.time}</Mono>}
            {showDate && (
              <Mono className="shrink-0 text-xs text-ink-faint">
                {entry.end > entry.start
                  ? `${fmtDayMonth(entry.start)}–${fmtDayMonth(entry.end)}`
                  : fmtDayMonth(entry.start)}
              </Mono>
            )}
          </span>
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">
              {entry.subtitle ? `${entry.subtitle} · ` : ''}
              {entry.statusLabel}
              {entry.units > 1 ? ` · ×${entry.units}` : ''}
            </span>
            {showMoney && money > 0 && (
              <Mono className="shrink-0 text-xs font-semibold text-ink">{gbp.format(money)}</Mono>
            )}
          </span>
        </span>
      </button>

      {!editable && open && (
        <div className="mb-1 ml-[22px] mr-2 rounded-lg bg-sunken px-3 py-2.5 text-xs text-ink-faint">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <Detail label="Type">{entry.typeLabel}</Detail>
            <Detail label="When">
              {entry.end > entry.start
                ? `${fmtShort(entry.start)} – ${fmtShort(entry.end)}`
                : fmtShort(entry.start)}
              {entry.time ? `, ${entry.time}` : ''}
            </Detail>
            {b?.customer && <Detail label="Customer">{b.customer}</Detail>}
            {b?.phone && <Detail label="Phone">{b.phone}</Detail>}
            {b?.address && <Detail label="Address">{b.address}</Detail>}
            {b?.postcode && <Detail label="Postcode">{b.postcode}</Detail>}
            {b?.addresses && <Detail label="Addresses">{b.addresses}</Detail>}
            <Detail label="Status">{entry.statusLabel}</Detail>
            {showMoney && entry.amount > 0 && <Detail label="Value">{gbp.format(entry.amount)}</Detail>}
            {b?.notes && <Detail label="Notes">{b.notes}</Detail>}
          </dl>
          <a
            href="#/finance"
            className={cx(
              'mt-2.5 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ember-deep no-underline hover:underline',
              focusRing,
            )}
          >
            Edit in Finance <ArrowRight size={13} aria-hidden />
          </a>
        </div>
      )}
    </li>
  )
}

function Detail({ label, children }) {
  return (
    <>
      <dt className="font-semibold text-ink-mute">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-ink-soft">{children}</dd>
    </>
  )
}
