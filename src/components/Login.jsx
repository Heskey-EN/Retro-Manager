import { useState } from 'react'
import Icon from './Icon'

// Translates a raw Supabase auth error message into friendly copy.
function friendlyAuthError(message) {
  if (!message) return 'Something went wrong — please try again.'
  if (/invalid login/i.test(message)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox.'
  if (/rate|too many/i.test(message)) return 'Too many attempts — try again in a minute.'
  return message
}

// Email/password sign in, with a sign-up toggle for new team members. New
// sign-ups land as 'pending' until an admin activates them (see AdminPage).
export default function Login({ auth }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signin') {
        const { error } = await auth.signIn(email.trim(), password)
        if (error) setMessage({ type: 'error', text: friendlyAuthError(error.message) })
      } else {
        const { data, error } = await auth.signUp(email.trim(), password, fullName.trim())
        if (error) setMessage({ type: 'error', text: friendlyAuthError(error.message) })
        else if (!data.session) {
          setMessage({ type: 'ok', text: 'If this email is new, check your inbox to confirm, then ask an admin to activate your access. If you already have an account, sign in instead.' })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Enter your email above first, then tap "Forgot password?" again.' })
      return
    }
    const target = email.trim()
    const { error } = await auth.resetPassword(target)
    if (error) setMessage({ type: 'error', text: friendlyAuthError(error.message) })
    else setMessage({ type: 'ok', text: `Reset link sent to ${target}.` })
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <p className="auth__eyebrow">Retrofit Project Management Tool</p>
        <h1 className="auth__title">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        <form className="auth__form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Full name</span>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" autoComplete="name" />
            </label>
          )}
          <label className="auth__field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ecofutures.co.uk" autoComplete="email" required autoFocus />
          </label>
          <label className="auth__field">
            <span>Password</span>
            <div className="auth__pw">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} />
              <button type="button" className="auth__pw-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </div>
          </label>
          {mode === 'signin' && (
            <div className="auth__row">
              <button type="button" className="auth__forgot" onClick={handleForgot}>Forgot password?</button>
            </div>
          )}
          {message && <p className={`auth__msg auth__msg--${message.type}`}>{message.text}</p>}
          <button className="auth__submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="auth__switch">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}>
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
