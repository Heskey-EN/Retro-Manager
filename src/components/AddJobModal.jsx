import { useState } from 'react'
import { Banner, Button, Field, FieldRow, Input, Modal, Select } from '../ui'
import { STATUSES, DEFAULT_STATUS } from '../lib/status'
import TagInput from './TagInput'

// The <form> lives in the modal body but its buttons sit in the footer, where
// they stay put while a long form scrolls. `form=` is what connects them.
const FORM_ID = 'add-job-form'

// Modal form for creating a single job by hand. The property address is the
// job's identity (its headline everywhere in the app), so it leads the form.
// `initialDate` pre-fills the dates when this was opened from a calendar day.
export default function AddJobModal({ onClose, onCreate, initialDate }) {
  const [form, setForm] = useState({
    address: '',
    postcode: '',
    reference: '',
    customer: '',
    measure: '',
    status: DEFAULT_STATUS,
    start_date: initialDate || '',
    end_date: initialDate || '',
    tags: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = form.address.trim() !== '' || form.reference.trim() !== ''

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
    <Modal
      title="Add a property"
      onClose={() => !saving && onClose()}
      footer={
        <>
          {/* Full width, so it takes its own line above the buttons and is
              still on screen when the body has scrolled. */}
          {error && <Banner tone="danger" className="w-full">{error}</Banner>}
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form={FORM_ID} tone="primary" disabled={saving || !canSubmit}>
            {saving ? 'Adding…' : 'Add job'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="grid gap-3.5">
        <Field label="Property address">
          <Input
            type="text"
            value={form.address}
            onChange={set('address')}
            placeholder="e.g. 27 Larch Close, Preston"
            autoFocus
            required={!form.reference?.trim()}
            aria-required={!form.reference?.trim()}
          />
        </Field>

        <FieldRow>
          <Field label="Postcode">
            <Input type="text" mono value={form.postcode} onChange={set('postcode')} placeholder="PR2 8HJ" />
          </Field>
          <Field label="Reference">
            <Input type="text" mono value={form.reference} onChange={set('reference')} placeholder="RF-3001" />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Customer">
            <Input type="text" value={form.customer} onChange={set('customer')} placeholder="Optional" />
          </Field>
          <Field label="Measure">
            <Input type="text" value={form.measure} onChange={set('measure')} placeholder="e.g. Cavity Wall Insulation" />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          {/* The two dates are one thing, so they stay paired at every width
              rather than splitting across the row. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input type="date" value={form.start_date} onChange={set('start_date')} />
            </Field>
            <Field label="End">
              <Input type="date" value={form.end_date} onChange={set('end_date')} />
            </Field>
          </div>
        </FieldRow>

        {/* as="div": TagInput is a group of controls, not one. */}
        <Field as="div" label="Tags">
          <TagInput
            value={form.tags}
            onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            placeholder="e.g. SHDF, EWI, Priority"
          />
        </Field>
      </form>
    </Modal>
  )
}
