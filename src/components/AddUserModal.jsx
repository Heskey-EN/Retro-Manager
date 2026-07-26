import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const ROLES = ['admin', 'member', 'viewer']

// A readable random password (no ambiguous characters).
function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const nums = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(nums, (n) => chars[n % chars.length]).join('')
}

// Admin form to create a user account directly (via the admin-create-user Edge
// Function). On success it shows the temporary password to hand to the person.
export default function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'member', password: randomPassword() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      // While showing the one-time password, don't let Escape dismiss it.
      if (done) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, done])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const email = form.email.trim().toLowerCase()
      const { data, error: err } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email,
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
        },
      })
      if (err) {
        setError('Could not reach the server function. Is it deployed?')
      } else if (!data?.ok) {
        setError(data?.error || 'Something went wrong.')
      } else {
        setDone({ email, password: form.password })
        onCreated?.()
      }
    } catch (err) {
      setError('Could not create the user — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyDetails() {
    try {
      await navigator.clipboard?.writeText(`Email: ${done.email}\nPassword: ${done.password}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — leave the credentials on screen for manual copy.
    }
  }

  function addAnother() {
    setDone(null)
    setCopied(false)
    setError(null)
    setForm((f) => ({ full_name: '', email: '', role: f.role, password: randomPassword() }))
  }

  return (
    <div className="modal-backdrop" onClick={done ? undefined : onClose}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add user">
        {done ? (
          <div className="adduser">
            <h2 className="adduser__title">User created</h2>
            <p className="adduser__note">
              Share these sign-in details with <strong>{done.email}</strong>. They can change the password after signing in.
            </p>
            <div className="adduser__creds">
              <div><span>Email</span><code>{done.email}</code></div>
              <div><span>Password</span><code>{done.password}</code></div>
            </div>
            <div className="adduser__actions">
              <button className="btn" onClick={copyDetails}>{copied ? 'Copied' : 'Copy details'}</button>
              <button className="btn" onClick={addAnother}>Add another</button>
              <button className="btn btn--primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form className="adduser" onSubmit={submit}>
            <h2 className="adduser__title">Add a user</h2>
            <label className="adduser__field">
              <span>Full name</span>
              <input type="text" value={form.full_name} onChange={set('full_name')} placeholder="Jane Smith" />
            </label>
            <label className="adduser__field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={set('email')} placeholder="jane@ecofutures.co.uk" required autoFocus />
            </label>
            <div className="adduser__row">
              <label className="adduser__field">
                <span>Role</span>
                <select value={form.role} onChange={set('role')}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="adduser__field">
                <span>Temporary password</span>
                <div className="adduser__pw">
                  <input type="text" value={form.password} onChange={set('password')} required minLength={6} />
                  <button type="button" className="btn btn--sm" onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))}>New</button>
                </div>
              </label>
            </div>
            {error && <p className="adduser__error">{error}</p>}
            <div className="adduser__actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
