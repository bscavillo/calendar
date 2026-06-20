import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsModal({ session, profile, onClose }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
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
        .update({ display_name: name })
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3 backdrop-blur-sm sm:p-5" onClick={onClose}>
      <form
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm bg-surface p-5 shadow-[0_20px_60px_rgba(63,58,71,0.3)] sm:p-7"
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
