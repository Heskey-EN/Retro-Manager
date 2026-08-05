import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Info } from 'lucide-react'
import { Button, Field, Input, Modal, SegmentedControl, cx } from '../ui'
import { addDays, todayISO, weekStart } from '../lib/dates.js'
import { epcFilename, epcRowsForWeek, toCsv, weekRangeFor } from '../lib/epcExport.js'
import { useCalendarEntries } from './useCalendarEntries.js'

// "Export a week for EPC sizes" — the file you upload to the EPC checker to get
// every property's floor area back in one go.
//
// It reads the SAME merged entries the week ahead lists, so a booking covering
// four properties exports four rows exactly as it shows four lines. What the
// file may and may not contain is decided in lib/epcExport.js, which is where
// the reasoning lives.
//
// Nothing is sent anywhere. This downloads a file; the owner uploads it himself
// on the checker's own admin page (that upload is the only import it has).

const WEEKS = [
  { value: 'this', label: 'This week' },
  { value: 'next', label: 'Next week' },
  { value: 'pick', label: 'Another' },
]

// How many rows to show before "…and N more". Enough to recognise the week on a
// 375px screen without turning the sheet into a scroll of forty lines.
const PREVIEW = 6

const ISO = /^\d{4}-\d{2}-\d{2}$/

export default function EpcExport({ jobs = [], onToast, className }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={cx('w-full sm:w-auto', className)}
        title="Download a week of properties to look up on the EPC checker"
      >
        <FileSpreadsheet size={16} /> Export a week for EPC sizes
      </Button>
      {/* Mounted only while open: the sheet merges the whole calendar to count
          what it would export, and there is no reason to do that behind a
          closed door on every Dashboard render. */}
      {open && <EpcExportSheet jobs={jobs} onToast={onToast} onClose={() => setOpen(false)} />}
    </>
  )
}

function EpcExportSheet({ jobs, onToast, onClose }) {
  const { entries } = useCalendarEntries(jobs)
  const today = todayISO()
  const [choice, setChoice] = useState('this')
  const [picked, setPicked] = useState(today)

  const { start, end, label } = useMemo(() => {
    if (choice === 'next') return weekRangeFor(addDays(weekStart(today), 7))
    // A half-typed date is a real state of a date input on a desktop, and
    // fromISO('2026-08') is an Invalid Date that would spread NaN through every
    // label below.
    if (choice === 'pick') return weekRangeFor(ISO.test(picked) ? picked : today)
    return weekRangeFor(today)
  }, [choice, picked, today])

  const { rows, stats } = useMemo(() => epcRowsForWeek(entries, start, end), [entries, start, end])

  function download() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = epcFilename(start)
    // In the document, and revoked late. iOS Safari fetches the blob after the
    // click handler has returned, so revoking immediately — as the Finance
    // export does — can save an empty file on the device this is demoed on.
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    onToast?.({
      type: 'success',
      text: `Exported ${rows.length} propert${rows.length === 1 ? 'y' : 'ies'} — upload it on the EPC checker.`,
    })
    onClose()
  }

  const shown = rows.slice(0, PREVIEW)

  return (
    <Modal
      title="Export a week for EPC sizes"
      subtitle="A spreadsheet to upload to the EPC checker"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={download} disabled={rows.length === 0}>
            <Download size={16} />
            Download {rows.length} propert{rows.length === 1 ? 'y' : 'ies'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field as="div" label="Which week">
          <SegmentedControl
            mode="radio"
            label="Which week"
            options={WEEKS}
            value={choice}
            onChange={setChoice}
            full
          />
        </Field>

        {choice === 'pick' && (
          <Field label="Any day in that week" hint="The whole Monday–Sunday week around it is exported.">
            <Input type="date" value={picked} onChange={(e) => setPicked(e.target.value)} />
          </Field>
        )}

        <div className="rounded-xl border border-line bg-sunken px-4 py-3">
          <p className="font-display text-base font-bold text-ink">{label}</p>
          <p className="mt-0.5 text-sm text-ink-faint">
            {rows.length === 0
              ? 'Nothing booked that week.'
              : `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'} from ${stats.bookings} booking${stats.bookings === 1 ? '' : 's'}.`}
          </p>

          {rows.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
              {shown.map((r, i) => (
                <li key={`${r.address}|${r.postcode}|${i}`} className="flex items-baseline gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{r.address}</span>
                  <span className="shrink-0 font-mono text-ink-faint">
                    {r.postcode || 'no postcode'}
                  </span>
                </li>
              ))}
              {rows.length > shown.length && (
                <li className="text-xs text-ink-faint">…and {rows.length - shown.length} more</li>
              )}
            </ul>
          )}
        </div>

        {/* Only the counts that mean something is missing or has been changed —
            a tidy week says nothing at all here. */}
        {(stats.merged > 0 || stats.withoutPostcode > 0 || stats.skipped.length > 0) && (
          <ul className="space-y-1 text-xs text-ink-faint">
            {stats.merged > 0 && (
              <li>
                {stats.merged} repeat{stats.merged === 1 ? '' : 's'} of the same property merged —
                the checker charges a lookup per row.
              </li>
            )}
            {stats.withoutPostcode > 0 && (
              <li>
                {stats.withoutPostcode} without a postcode — still included, and the checker will
                report them as “no postcode found”.
              </li>
            )}
            {stats.skipped.length > 0 && (
              <li>
                {stats.skipped.length} left out with no address ({stats.skipped.slice(0, 2).join(', ')}
                {stats.skipped.length > 2 ? '…' : ''}) — a postcode on its own never matches.
              </li>
            )}
          </ul>
        )}

        <p className="flex items-start gap-1.5 text-xs leading-snug text-ink-mute">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Address, postcode and customer only. Dates, references and prices are deliberately left
            out — the checker matches on the numbers in the row, so any extra figure makes it miss
            the property. Upload the file on the EPC checker’s admin page under “Bulk EPC lookup”;
            nothing is sent from here.
          </span>
        </p>
      </div>
    </Modal>
  )
}
