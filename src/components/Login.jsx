import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          // New accounts get their display name from here; the DB trigger still
          // falls back to the email handle and enforces the 2-user cap.
          data: { display_name: displayName.trim() || cleanEmail.split('@')[0] },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="centered-screen">
        <div className="card login-card">
          <h1>Check your email</h1>
          <p className="muted">
            We sent a secure sign-in link to <strong>{email.trim().toLowerCase()}</strong>.
            Open it on this device to log in. The link expires shortly and can be used once.
          </p>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setSent(false)
              setError(null)
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="centered-screen">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>Our Calendar</h1>
        <p className="muted">Enter your email and we'll send you a one-time sign-in link — no password needed.</p>

        <label>
          Your name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Benedict (first time only)"
          />
        </label>

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {error && <div className="alert error">{error}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </div>
  )
}
