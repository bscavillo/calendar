import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// A small palette so each partner can pick a personal color without a full
// color picker. Pastel purple / blue lead as the defaults.
const PALETTE = [
  '#a99ce6', '#9fbef0', '#e7a8cd', '#c2a892',
  '#9fd6c2', '#d6b3e6', '#e6c79f', '#a9c9e6',
]

export default function SettingsModal({ session, profile, onClose }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [color, setColor] = useState(profile?.color || PALETTE[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const name = displayName.trim()
      if (!name) throw new Error('Please enter a name.')
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name, color })
        .eq('id', session.user.id)
      if (error) throw error
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-5 backdrop-blur-sm" onClick={onClose}>
      <form
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm bg-surface p-7 shadow-[0_20px_60px_rgba(63,58,71,0.3)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="mt-1 text-muted">How you show up on the calendar.</p>

        <label className="field-label">
          Your name
          <input
            autoFocus
            required
            className="field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Benedict"
          />
        </label>

        <label className="field-label">Your color</label>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              className={`h-8 w-8 rounded-sm p-0 ${c === color ? 'ring-2 ring-ink' : 'ring-1 ring-line'}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Choose color ${c}`}
            />
          ))}
        </div>

        {error && <div className="mt-3.5 rounded-sm bg-danger/15 px-3 py-2.5 text-sm text-danger-strong">{error}</div>}

        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
