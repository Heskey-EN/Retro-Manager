import { useRef, useState } from 'react'
import { Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Modal, StatusChip } from './ui.jsx'
import { importJobs, gbp, JOB_TYPES } from '../lib/store.js'
import { csvToJobs, CSV_TEMPLATE } from '../lib/csv.js'
import { fmtDayMonth } from '../lib/dates.js'

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'jobs-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportCsvModal({ onClose }) {
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { jobs, errors, fileName }
  const [failure, setFailure] = useState('')

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { jobs, errors } = csvToJobs(await file.text())
      setParsed({ jobs, errors, fileName: file.name })
      setFailure('')
    } catch (err) {
      setFailure(`Couldn't read that file: ${err.message}`)
    }
    e.target.value = ''
  }

  function confirm() {
    importJobs(parsed.jobs)
    onClose()
  }

  return (
    <Modal title="Import jobs from CSV" onClose={onClose} wide>
      {!parsed ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Pick a CSV file (exported from Excel or Google Sheets) and every row becomes a job on the
            calendar. It just needs a <strong>Date</strong> column — Customer, Time, Type, Address,
            Postcode, Price, Phone, Status and Notes are all picked up when present.
          </p>
          <p className="mb-4 text-xs text-slate-500">
            Dates can be 06/07/2026 or 2026-07-06 · Type can be EPC, Retrofit or Other (EPC is assumed) ·
            Status can be Booked, Done or Paid.
          </p>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="btn-primary flex-1 rounded-lg">
              <Upload size={16} /> Choose CSV file
            </button>
            <button onClick={downloadTemplate} className="btn-outline flex-1 rounded-lg">
              <Download size={16} /> Get a template
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          {failure && <p className="mt-3 text-sm font-semibold text-red-600">{failure}</p>}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm">
            <span className="font-bold text-accent-green">
              <CheckCircle2 size={14} className="mr-1 inline" />
              {parsed.jobs.length} job{parsed.jobs.length === 1 ? '' : 's'} ready
            </span>
            <span className="text-slate-500"> from {parsed.fileName}</span>
            {parsed.jobs.length > 0 && (
              <span className="text-slate-500">
                {' '}
                · worth {gbp.format(parsed.jobs.reduce((s, j) => s + j.price, 0))}
              </span>
            )}
          </p>

          {parsed.errors.length > 0 && (
            <div className="mb-3 max-h-24 overflow-y-auto rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              <p className="mb-1 font-bold">
                <AlertTriangle size={12} className="mr-1 inline" />
                {parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'} skipped:
              </p>
              {parsed.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}

          {parsed.jobs.length > 0 && (
            <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5">Date</th>
                    <th className="px-2.5 py-1.5">Customer</th>
                    <th className="px-2.5 py-1.5">Type</th>
                    <th className="px-2.5 py-1.5 text-right">Price</th>
                    <th className="px-2.5 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.jobs.map((j, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                        {fmtDayMonth(j.date)}
                        {j.time && <span className="ml-1 font-normal text-slate-500">{j.time}</span>}
                      </td>
                      <td className="max-w-[160px] truncate px-2.5 py-1.5">{j.customer || '—'}</td>
                      <td className="px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: JOB_TYPES[j.type]?.color }}
                          />
                          {JOB_TYPES[j.type]?.label}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right">{j.price ? gbp.format(j.price) : '—'}</td>
                      <td className="px-2.5 py-1.5"><StatusChip status={j.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setParsed(null)} className="btn-outline flex-1 rounded-lg !px-4 !py-3">
              Pick a different file
            </button>
            <button onClick={confirm} disabled={parsed.jobs.length === 0} className="btn-primary flex-1 rounded-lg !px-4 !py-3 disabled:opacity-40">
              Add {parsed.jobs.length} job{parsed.jobs.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
