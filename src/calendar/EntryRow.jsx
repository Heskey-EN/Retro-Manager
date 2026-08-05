import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Mono, cx, focusRing } from '../ui'
import { gbp } from '../business/lib/store.js'
import { fmtDayMonth, fmtShort } from '../lib/dates.js'
import { amountOn, entryDetails } from './entries.js'

// One line of the calendar, shared by the day sheet and the "Next up" list so
// a booking reads identically wherever you meet it.

// Beyond this many properties a booking would own the whole screen, so the rest
// go behind one tap. Six is what fits under a day's dropdown on a 375px phone
// without pushing the next day off it.
const PROPERTY_CAP = 6

// One shape and one colour scale for every booking.
//
// There used to be two: a filled circle for a job, a hollow square for anything
// held by Finance, with a legend naming them "Finance entries". That told the
// user something true about our storage and nothing useful about their day, so
// it is gone. Both now colour by status, which the calendar's legend already
// explains in full.
export function Swatch({ entry, size = 10 }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full"
      style={{
        height: size,
        width: size,
        backgroundColor: entry.colour,
        opacity: entry.cancelled ? 0.45 : 1,
      }}
    />
  )
}

export function EntryRow({
  entry, iso, showMoney, canEdit = true, onOpenJob, onOpenEntry, showDate = false,
}) {
  // A row that cannot open an editor expands in place instead, showing the
  // whole record. Nothing is hidden — you can still read the address, the time
  // and the notes for a job you are not allowed to change.
  const [open, setOpen] = useState(false)
  const money = amountOn(entry, iso || entry.start)

  // Where a tap would go, if it may go anywhere. A job opens the job editor; a
  // Finance entry opens Finance's, which only the Finance tab supplies.
  const editor = entry.kind === 'job' ? onOpenJob : onOpenEntry
  const editable = canEdit && Boolean(editor)
  const details = editable ? [] : entryDetails(entry)

  const activate = () => {
    if (!editable) return setOpen((v) => !v)
    if (entry.kind === 'job') onOpenJob(entry.source)
    else onOpenEntry(entry)
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

      {/* Past ONE property only. Every entry carries its property list now (it
          is what the EPC export sends), and a single one is already the row's
          own title — listing it under itself would just say it twice. */}
      {entry.properties?.length > 1 && (
        <PropertyList properties={entry.properties} showMoney={showMoney} />
      )}

      {!editable && open && (
        <div className="mb-1 ml-[22px] mr-2 rounded-lg bg-sunken px-3 py-2.5 text-xs text-ink-faint">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <Detail label="When">
              {entry.end > entry.start
                ? `${fmtShort(entry.start)} – ${fmtShort(entry.end)}`
                : fmtShort(entry.start)}
              {entry.time ? `, ${entry.time}` : ''}
            </Detail>
            {details.map((d) => (
              <Detail key={d.label} label={d.label}>{d.value}</Detail>
            ))}
            <Detail label="Status">{entry.statusLabel}</Detail>
            {showMoney && entry.amount > 0 && <Detail label="Value">{gbp.format(entry.amount)}</Detail>}
          </dl>

          {/* Only when the ACCOUNT is the reason. A row that simply has no
              editor on this screen says nothing — an unexplained note would be
              the source badge back in prose. */}
          {!canEdit && (
            <p className="mt-2.5 flex items-start gap-1.5 leading-snug text-ink-mute">
              <Lock size={12} className="mt-px shrink-0" aria-hidden />
              <span>
                You can see this booking but not change it. Ask an organisation admin to move it or
                edit the details.
              </span>
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// The addresses a single booking covers, under the row that carries them.
//
// Open by default, not behind a second disclosure: the day above is already one
// tap, and an address you have to hunt for is the bug this fixes — "×4" said a
// run existed and named none of it, so three of four properties were readable
// only by opening Finance. They are text, not buttons, because none of them has
// a record of its own to open; a batch booked from the Dashboard is separate
// jobs, so each of those addresses is a real tappable row already.
function PropertyList({ properties, showMoney }) {
  const [all, setAll] = useState(false)
  const shown = all ? properties : properties.slice(0, PROPERTY_CAP)
  const rest = properties.length - shown.length

  return (
    <ul className="mb-1.5 ml-[30px] mr-2 border-l border-line pl-2.5">
      {shown.map((p, i) => (
        <li key={`${i}-${p.label}`} className="flex items-baseline gap-2 py-0.5">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{p.label}</span>
          {showMoney && p.amount > 0 && (
            <Mono className="shrink-0 text-[11px] text-ink-faint">{gbp.format(p.amount)}</Mono>
          )}
        </li>
      ))}
      {rest > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setAll(true)}
            className={cx(
              'min-h-11 text-xs font-semibold text-ink-faint transition-colors hover:text-ink',
              focusRing,
            )}
          >
            Show {rest} more
          </button>
        </li>
      )}
    </ul>
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
