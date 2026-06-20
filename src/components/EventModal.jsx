import { useState } from 'react'
import { format, parseISO, addHours, setHours } from 'date-fns'
import { supabase } from '../lib/supabaseClient'
import {
  browserTimeZone,
  zoneAbbrev,
  formatTimeInZone,
  formatDateInZone,
  zoneCity,
} from '../lib/time'

const REMIND_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

function defaultTimes(date) {
  const base = setHours(date, Math.max(new Date().getHours() + 1, 9))
  const start = new Date(base)
  start.setMinutes(0, 0, 0)
  return { start, end: addHours(start, 1) }
}

export default function EventModal({ session, profiles, initial, onClose }) {
  const userId = session.user.id
  const isView = initial.mode === 'view'
  const event = initial.event

  if (isView && event) {
    return <ViewMode event={event} userId={userId} profiles={profiles} onClose={onClose} session={session} />
  }
  return <FormMode initial={initial} session={session} onClose={onClose} />
}

function ViewMode({ event, userId, profiles, onClose, session }) {
  const [editing, setEditing] = useState(false)
  const isOwner = event.owner_id === userId
  const ownerName = event.owner_id === userId ? 'You' : (profiles[event.owner_id]?.display_name || 'Partner')

  if (editing) {
    return <FormMode initial={{ mode: 'edit', event }} session={session} onClose={onClose} />
  }

  async function handleDelete() {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (error) alert(error.message)
    else onClose()
  }

  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)

  // Show the time in the viewer's own zone, and — when the partner lives in a
  // different zone — the same instant in theirs, so the alignment is visible.
  const myTz = browserTimeZone()
  const partner = Object.values(profiles).find((p) => p.id !== userId)
  const partnerTz = partner?.timezone
  const showPartnerTime =
    !event.all_day && partnerTz && partnerTz !== myTz

  return (
    <Backdrop onClose={onClose}>
      <div className="modal">
        <div className={`modal-accent ${event.is_shared ? 'shared' : isOwner ? 'mine' : 'partner'}`} />
        <h2>{event.title}</h2>
        <p className="muted">
          {event.is_shared ? 'Shared' : ownerName}
        </p>
        <dl className="detail-list">
          <div>
            <dt>When</dt>
            <dd>
              {event.all_day ? (
                formatDateInZone(start, myTz) + ' · All day'
              ) : (
                <>
                  <div className="when-zone">
                    {formatDateInZone(start, myTz)} ·{' '}
                    {formatTimeInZone(start, myTz)} – {formatTimeInZone(end, myTz)}
                    <span className="zone-tag">
                      {zoneAbbrev(myTz, start)} · your time
                    </span>
                  </div>
                  {showPartnerTime && (
                    <div className="when-zone partner-zone">
                      {formatDateInZone(start, partnerTz)} ·{' '}
                      {formatTimeInZone(start, partnerTz)} –{' '}
                      {formatTimeInZone(end, partnerTz)}
                      <span className="zone-tag">
                        {zoneAbbrev(partnerTz, start)} ·{' '}
                        {partner.display_name || zoneCity(partnerTz)}&rsquo;s time
                      </span>
                    </div>
                  )}
                </>
              )}
            </dd>
          </div>
          {event.location && (
            <div><dt>Where</dt><dd>{event.location}</dd></div>
          )}
          {event.description && (
            <div><dt>Notes</dt><dd>{event.description}</dd></div>
          )}
        </dl>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
          {isOwner && (
            <>
              <button className="btn danger" onClick={handleDelete}>Delete</button>
              <button className="btn primary" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
        </div>
        {!isOwner && <p className="hint">Only {ownerName.toLowerCase() === 'you' ? 'you' : ownerName} can edit this event.</p>}
      </div>
    </Backdrop>
  )
}

function FormMode({ initial, session, onClose }) {
  const editing = initial.mode === 'edit'
  const ev = initial.event
  const baseDate = editing ? parseISO(ev.start_at) : (initial.date || new Date())
  const times = defaultTimes(baseDate)

  const [title, setTitle] = useState(editing ? ev.title : '')
  const [description, setDescription] = useState(editing ? ev.description || '' : '')
  const [location, setLocation] = useState(editing ? ev.location || '' : '')
  // All-day events are stored at noon UTC, so their date is the UTC date
  // portion verbatim; reading it that way avoids any local-zone drift on edit.
  const [dateStr, setDateStr] = useState(
    editing && ev.all_day ? ev.start_at.slice(0, 10) : format(baseDate, 'yyyy-MM-dd')
  )
  const [allDay, setAllDay] = useState(editing ? ev.all_day : false)
  const [startTime, setStartTime] = useState(
    editing ? format(parseISO(ev.start_at), 'HH:mm') : format(times.start, 'HH:mm')
  )
  const [endTime, setEndTime] = useState(
    editing ? format(parseISO(ev.end_at), 'HH:mm') : format(times.end, 'HH:mm')
  )
  const [isShared, setIsShared] = useState(editing ? ev.is_shared : false)
  const [remind, setRemind] = useState(editing && ev.remind_minutes != null ? String(ev.remind_minutes) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      let start_at, end_at
      if (allDay) {
        // All-day events are a calendar date, not an instant: a birthday on
        // Jun 20 is Jun 20 in every zone. Anchoring to noon UTC keeps the date
        // stable when viewed from any realistic zone (instead of local midnight,
        // which would drift the event onto the previous/next day for a partner
        // in another zone).
        start_at = `${dateStr}T12:00:00.000Z`
        end_at = `${dateStr}T12:00:00.000Z`
      } else {
        start_at = new Date(`${dateStr}T${startTime}`).toISOString()
        end_at = new Date(`${dateStr}T${endTime}`).toISOString()
        if (new Date(end_at) <= new Date(start_at)) {
          throw new Error('End time must be after start time.')
        }
      }
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at,
        end_at,
        all_day: allDay,
        is_shared: isShared,
        remind_minutes: remind === '' ? null : Number(remind),
      }
      if (editing) {
        const { error } = await supabase.from('events').update(payload).eq('id', ev.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('events')
          .insert({ ...payload, owner_id: session.user.id })
        if (error) throw error
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <form className="modal" onSubmit={handleSubmit}>
        <h2>{editing ? 'Edit event' : 'New event'}</h2>

        <label>
          Title
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner with Mom" />
        </label>

        <label>
          Date
          <input type="date" required value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        {!allDay && (
          <div className="time-row">
            <label>
              Start
              <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label>
              End
              <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        )}

        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
        </label>

        <label>
          Notes
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
        </label>

        <label>
          Reminder
          <select value={remind} onChange={(e) => setRemind(e.target.value)}>
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="checkbox-row shared-toggle">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          Shared event (belongs to both of us)
        </label>

        {error && <div className="alert error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}
