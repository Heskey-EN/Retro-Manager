import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Modal, Field, inputCls } from './ui.jsx'
import { addJob, updateJob, deleteJob, JOB_TYPES, gbp } from '../lib/store.js'
import { todayISO } from '../lib/dates.js'

// Add or edit a job / company-work block. Pass `job` to edit, `initialDate`
// to pre-fill the date when adding from a calendar day.
export default function JobModal({ job, initialDate, initialType, onClose }) {
  const editing = Boolean(job)
  const [form, setForm] = useState(
    job
      ? { moreEpcs: [], perDay: '', perPrice: '', addresses: '', account: 'business', ...job }
      : {
          type: initialType || 'epc',
          date: initialDate || todayISO(),
          endDate: '',
          time: '',
          customer: '',
          phone: '',
          address: '',
          postcode: '',
          price: '',
          status: 'booked',
          notes: '',
          moreEpcs: [],
          perDay: '',
          perPrice: '',
          addresses: '',
          account: 'business',
        }
  )
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isBlock = form.type === 'company'
  const isEpc = form.type === 'epc'
  const hasExtras = isEpc && form.moreEpcs.length > 0

  // Company weeks: days in the block × assessments/day × £ per assessment
  const blockDays =
    isBlock && form.endDate && form.endDate > form.date
      ? Math.round((new Date(form.endDate) - new Date(form.date)) / 86400000) + 1
      : 1
  const isRateBlock = isBlock && Number(form.perDay) > 0 && Number(form.perPrice) > 0
  const rateTotal = blockDays * (Number(form.perDay) || 0) * (Number(form.perPrice) || 0)

  const setEpc = (i, k) => (e) =>
    setForm((f) => ({
      ...f,
      moreEpcs: f.moreEpcs.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value } : x)),
    }))
  const addEpcRow = () => setForm((f) => ({ ...f, moreEpcs: [...f.moreEpcs, { address: '', price: '' }] }))
  const removeEpcRow = (i) => setForm((f) => ({ ...f, moreEpcs: f.moreEpcs.filter((_, idx) => idx !== i) }))

  const batchTotal =
    (Number(form.price) || 0) + form.moreEpcs.reduce((s, x) => s + (Number(x.price) || 0), 0)

  function submit(e) {
    e.preventDefault()
    // Number('0') is falsy, so an address-less row priced at 0 is treated as empty
    const extras = form.moreEpcs.filter((x) => x.address || Number(x.price))
    if (
      !isEpc &&
      extras.length > 0 &&
      !window.confirm(
        `This will remove the ${extras.length} extra EPC${extras.length === 1 ? '' : 's'} on this entry — carry on?`
      )
    ) {
      return
    }
    const payload = {
      ...form,
      price: isRateBlock ? rateTotal : form.price === '' ? 0 : Number(form.price),
      endDate: isBlock && form.endDate ? form.endDate : '',
      moreEpcs: isEpc
        ? extras.map((x) => ({ address: x.address, price: x.price === '' ? 0 : Number(x.price) }))
        : [],
      perDay: isBlock ? Number(form.perDay) || 0 : 0,
      perPrice: isBlock ? Number(form.perPrice) || 0 : 0,
      addresses: isBlock ? form.addresses : '',
    }
    // Company blocks don't show these fields — clear any values left over
    // from a previous job type so they don't leak into the calendar display
    if (isBlock) Object.assign(payload, { address: '', postcode: '', time: '' })
    if (editing) updateJob(job.id, payload)
    else addJob(payload)
    onClose()
  }

  function remove() {
    if (window.confirm('Delete this entry? This can’t be undone.')) {
      deleteJob(job.id)
      onClose()
    }
  }

  return (
    <Modal title={editing ? 'Edit entry' : isBlock ? 'Company work / block out' : 'Add job'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Type">
          <select className={inputCls} value={form.type} onChange={set('type')}>
            {Object.entries(JOB_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isBlock ? 'From' : 'Date'}>
            <input type="date" required className={inputCls} value={form.date} onChange={set('date')} />
          </Field>
          {isBlock ? (
            <Field label="To (optional)">
              <input type="date" className={inputCls} value={form.endDate} min={form.date} onChange={set('endDate')} />
            </Field>
          ) : (
            <Field label="Time (optional)">
              <input type="time" className={inputCls} value={form.time} onChange={set('time')} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isBlock ? 'Company (optional)' : 'Customer'}>
            <input
              className={inputCls}
              value={form.customer}
              onChange={set('customer')}
              placeholder={isBlock ? 'Company name' : 'Name'}
            />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={set('phone')} />
          </Field>
        </div>

        {!isBlock && (
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Address">
              <input className={inputCls} value={form.address} onChange={set('address')} />
            </Field>
            <Field label="Postcode">
              <input className={inputCls} value={form.postcode} onChange={set('postcode')} />
            </Field>
          </div>
        )}

        {isBlock && (
          <div className="rounded-lg bg-slate-50 p-3">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Paid per assessment? Set the day rate
            </span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Assessments per day">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={inputCls}
                  value={form.perDay}
                  onChange={set('perDay')}
                  placeholder="e.g. 4"
                />
              </Field>
              <Field label="Price per assessment (£)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={form.perPrice}
                  onChange={set('perPrice')}
                  placeholder="e.g. 45.00"
                />
              </Field>
            </div>
            {isRateBlock && (
              <p className="mt-2 text-right text-xs font-bold text-navy">
                {blockDays} day{blockDays === 1 ? '' : 's'} × {Number(form.perDay)} × {gbp.format(Number(form.perPrice))} ={' '}
                {gbp.format(rateTotal)}
              </p>
            )}
            <Field label="Addresses / details (optional — one per line)" className="mt-3">
              <textarea
                className={inputCls}
                rows={2}
                value={form.addresses}
                onChange={set('addresses')}
                placeholder={'12 High St, PR1 1AA\n34 Park Rd, FY2 2BB\n…add them later if you like'}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              isRateBlock
                ? 'Pay for the block (worked out)'
                : isBlock
                  ? 'Pay for the block (£, optional)'
                  : hasExtras
                    ? '1st EPC price (£)'
                    : 'Price (£)'
            }
          >
            {isRateBlock ? (
              <input className={`${inputCls} bg-slate-100 font-bold text-navy`} value={gbp.format(rateTotal)} disabled />
            ) : (
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.price}
                onChange={set('price')}
                placeholder="0.00"
              />
            )}
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={set('status')}>
              <option value="booked">Booked</option>
              <option value="done">Done — unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
        </div>

        <Field label="Paid to (cost centre)">
          <select className={inputCls} value={form.account} onChange={set('account')}>
            <option value="business">Eco Futures</option>
            <option value="personal">Me personally</option>
          </select>
        </Field>

        {isEpc && (
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {hasExtras ? `${form.moreEpcs.length + 1} EPCs on this visit` : 'Doing more than one EPC?'}
              </span>
              <button
                type="button"
                onClick={addEpcRow}
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-blue hover:underline"
              >
                <Plus size={12} /> Add another EPC
              </button>
            </div>
            {hasExtras && (
              <>
                <div className="mt-2 space-y-2">
                  {form.moreEpcs.map((x, i) => (
                    <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2">
                      <input
                        className={inputCls}
                        placeholder={`EPC ${i + 2} — address / postcode`}
                        value={x.address}
                        onChange={setEpc(i, 'address')}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        placeholder="£"
                        value={x.price}
                        onChange={setEpc(i, 'price')}
                      />
                      <button
                        type="button"
                        onClick={() => removeEpcRow(i)}
                        className="rounded-lg border border-slate-200 px-2 text-slate-400 hover:text-red-600"
                        title="Remove this EPC"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-right text-xs font-bold text-navy">
                  Total for the visit: {gbp.format(batchTotal)}
                </p>
              </>
            )}
          </div>
        )}

        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex gap-2 pt-1">
          {editing && (
            <button type="button" onClick={remove} className="rounded-lg border-2 border-red-200 px-3 text-red-600 hover:bg-red-50" title="Delete">
              <Trash2 size={16} />
            </button>
          )}
          <button type="submit" className="btn-primary flex-1 rounded-lg">
            {editing ? 'Save changes' : isBlock ? 'Block out' : 'Add job'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
