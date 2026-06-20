import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { display_name: displayName.trim() || cleanEmail.split('@')[0] },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        // With email confirmation on, no session is returned until the user
        // clicks the link in their inbox.
        if (!data.session) {
          setConfirmSent(true)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })
        if (error) throw error
      }
    } catch (err) {
      setError(friendlyError(err.message))
    } finally {
      setBusy(false)
    }
  }

  if (confirmSent) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md rounded-sm bg-surface p-8 shadow-[0_8px_30px_rgba(120,110,160,0.12)]">
          <h1 className="text-2xl font-semibold">Confirm your email</h1>
          <p className="mt-1 text-muted">
            We sent a confirmation link to <strong>{email.trim().toLowerCase()}</strong>.
            Click it to verify your account, then come back and sign in.
          </p>
          <button
            type="button"
            className="mt-4 w-full text-sm text-mine-strong underline"
            onClick={() => {
              setConfirmSent(false)
              setMode('signin')
              setError(null)
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form
        className="w-full max-w-md rounded-sm bg-surface p-8 shadow-[0_8px_30px_rgba(120,110,160,0.12)]"
        onSubmit={handleSubmit}
      >
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="mt-1 text-muted">{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</p>

        {mode === 'signup' && (
          <label className="field-label">
            Your name
            <input
              type="text"
              className="field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Benedict"
            />
          </label>
        )}

        <label className="field-label">
          Email
          <input
            type="email"
            required
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="field-label">
          Password
          <input
            type="password"
            required
            minLength={8}
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && (
          <div className="mt-3.5 rounded-sm bg-danger/15 px-3 py-2.5 text-sm text-danger-strong">{error}</div>
        )}

        <button className="btn btn-primary mt-5 w-full" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-sm text-mine-strong underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}

// Turn a few common Supabase/Postgres messages into something readable.
function friendlyError(message) {
  if (!message) return 'Something went wrong. Please try again.'
  if (message.includes('not authorized')) {
    return 'This email is not authorized to use this calendar.'
  }
  if (message.includes('limited to 2 users')) {
    return 'This calendar already has its two users.'
  }
  if (message.includes('Database error saving new user')) {
    // The signup trigger rejected it (not on the allowlist or cap reached).
    return 'This email is not authorized to use this calendar.'
  }
  if (message.toLowerCase().includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.'
  }
  return message
}
