import { useEffect, useState } from 'react'
import Icon from './Icon'
import { STATUSES, DEFAULT_STATUS } from '../lib/status'
import TagInput from './TagInput'

// Modal form for creating a single job by hand. The property address is the
// job's identity (its headline everywhere in the app), so it leads the form.
export default function AddJobModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    address: '',
    postcode: '',
    reference: '',
    customer: '',
    measure: '',
    status: DEFAULT_STATUS,
    start_date: '',
    end_date: '',
    tags: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = form.address.trim() !== '' || form.reference.trim() !== ''

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const address = form.address.trim()
    const reference = form.reference.trim()
    if (!address && !reference) {
      setError('Enter a property address or a reference.')
      return
    }
    const title = address || reference
    setError('')
    setSaving(true)
    const data = {}
    if (reference) data.Reference = reference
    if (address) data.Address = address
    const postcode = form.postcode.trim().toUpperCase()
    if (postcode) data.Postcode = postcode
    if (form.customer.trim()) data.Customer = form.customer.trim()
    if (form.measure.trim()) data.Measure = form.measure.trim()
    try {
      await onCreate({
        title,
        reference,
        postcode,
        customer: form.customer.trim(),
        measure: form.measure.trim(),
        status: form.status,
        tags: form.tags,
        start_date: form.start_date || null,
        end_date: form.end_date || form.start_date || null,
        data,
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not add the job. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add job">
        <header className="modal__header">
          <div>
            <p className="eyebrow">New job</p>
            <h2 className="modal__title">Add a property</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <form onSubmit={submit} className="modal__form">
          <label className="field field--full">
            <span>Property address</span>
            <input type="text" value={form.address} onChange={set('address')} placeholder="e.g. 27 Larch Close, Preston" autoFocus required={!form.reference?.trim()} aria-required={!form.reference?.trim()} />
          </label>
          <div className="modal__row">
            <label className="field">
              <span>Postcode</span>
              <input type="text" className="mono" value={form.postcode} onChange={set('postcode')} placeholder="PR2 8HJ" />
            </label>
            <label className="field">
              <span>Reference</span>
              <input type="text" className="mono" value={form.reference} onChange={set('reference')} placeholder="RF-3001" />
            </label>
          </div>
          <div className="modal__row">
            <label className="field">
              <span>Customer</span>
              <input type="text" value={form.customer} onChange={set('customer')} placeholder="Optional" />
            </label>
            <label className="field">
              <span>Measure</span>
              <input type="text" value={form.measure} onChange={set('measure')} placeholder="e.g. Cavity Wall Insulation" />
            </label>
          </div>
          <div className="modal__row">
            <label className="field">
              <span>Stage</span>
              <select value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <div className="modal__row modal__row--tight">
              <label className="field">
                <span>Start</span>
                <input type="date" value={form.start_date} onChange={set('start_date')} />
              </label>
              <label className="field">
                <span>End</span>
                <input type="date" value={form.end_date} onChange={set('end_date')} />
              </label>
            </div>
          </div>
          <div className="field field--full">
            <span>Tags</span>
            <TagInput value={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} placeholder="e.g. SHDF, EWI, Priority" />
          </div>
          {error && <p className="modal__error" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving || !canSubmit}>
              {saving ? 'Adding…' : 'Add job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
