import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// A small palette so each partner can pick a personal color without a full
// color picker. The first two are the classic purple / blue defaults.
const PALETTE = [
  '#7c6fd6', '#4a90e2', '#e2557a', '#e08e3c',
  '#3cb371', '#9b59b6', '#16a3a3', '#d6336c',
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
    <div className="backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Settings</h2>
        <p className="muted">How you show up on the calendar.</p>

        <label>
          Your name
          <input
            autoFocus
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Benedict"
          />
        </label>

        <label>Your color</label>
        <div className="swatch-row">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${c === color ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Choose color ${c}`}
            />
          ))}
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
