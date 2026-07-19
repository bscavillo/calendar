import { useState } from 'react'
import { format, parseISO, addHours, setHours } from 'date-fns'
import { supabase } from '../lib/supabaseClient'
import {
  browserTimeZone,
  formatTimeInZone,
  formatDateInZone,
  zoneCity,
} from '../lib/time'
import { eventColor } from '../lib/eventColor'
import { RECURRENCE_OPTIONS, recurrenceLabel } from '../lib/recurrence'

const REMIND_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

// When the user clicked a specific slot in the week/day grid (atTime), start at
// exactly that time. Otherwise (month-cell click or the New-event button) fall
// back to the next whole hour, no earlier than 9am.
function defaultTimes(date, atTime) {
  let start
  if (atTime) {
    start = new Date(date)
    start.setSeconds(0, 0)
  } else {
    start = setHours(date, Math.max(new Date().getHours() + 1, 9))
    start.setMinutes(0, 0, 0)
  }
  return { start, end: addHours(start, 1) }
}

export default function EventModal({ session, profiles, primaryUserId, initial, onClose }) {
  const userId = session.user.id
  const isView = initial.mode === 'view'
  const event = initial.event

  if (isView && event) {
    return <ViewMode event={event} userId={userId} profiles={profiles} primaryUserId={primaryUserId} onClose={onClose} session={session} />
  }
  return <FormMode initial={initial} session={session} onClose={onClose} />
}

function ViewMode({ event, userId, profiles, primaryUserId, onClose, session }) {
  const [editing, setEditing] = useState(false)
  // A repeating occurrence can be deleted on its own (just this one) or with the
  // whole series; that choice is offered inline instead of a browser confirm.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ownerName = event.owner_id === userId ? 'You' : (profiles[event.owner_id]?.display_name || 'Other')

  if (editing) {
    return <FormMode initial={{ mode: 'edit', event }} session={session} onClose={onClose} />
  }

  async function deleteSeries() {
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (error) alert(error.message)
    else onClose()
  }

  // Remove a single occurrence by marking it cancelled in the master's overrides,
  // leaving the rest of the series in place.
  async function deleteOccurrence() {
    const occKey = event.occurrenceKey || event.series_start_at
    const nextOverrides = { ...(event.overrides || {}), [occKey]: { cancelled: true } }
    const { error } = await supabase.from('events').update({ overrides: nextOverrides }).eq('id', event.id)
    if (error) alert(error.message)
    else onClose()
  }

  async function handleDelete() {
    if (event.is_recurring_instance) {
      setConfirmDelete(true) // repeating: let the user pick occurrence vs series
      return
    }
    if (!confirm('Delete this event?')) return
    await deleteSeries()
  }

  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)

  // Show the time in the viewer's own zone, and — when the other user lives in
  // a different zone — the same instant in theirs, so the alignment is visible.
  const viewerTz = browserTimeZone()
  const otherUser = Object.values(profiles).find((p) => p.id !== userId)
  const otherTz = otherUser?.timezone
  const showOtherTime =
    !event.all_day && otherTz && otherTz !== viewerTz

  return (
    <Backdrop onClose={onClose}>
      <div className={MODAL}>
        <div className="mb-3.5 h-1.5 w-[60px] rounded-sm" style={{ background: eventColor(event, primaryUserId) }} />
        <h2 className="text-xl font-semibold">{event.title}</h2>
        <p className="mt-1">
          {event.is_shared ? 'Shared' : ownerName}
        </p>
        <dl className="mt-4">
          <div className="mb-3">
            <dt className="text-lg font-bold">When</dt>
            <dd className="mt-0.5 text-base">
              {event.all_day ? (
                formatDateInZone(start, viewerTz) + ' · All day'
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    {formatDateInZone(start, viewerTz)} ·{' '}
                    {formatTimeInZone(start, viewerTz)} – {formatTimeInZone(end, viewerTz)}
                  </div>
                  {showOtherTime && (
                    <div className="mt-1 flex flex-wrap items-baseline gap-1.5 text-muted">
                      {formatDateInZone(start, otherTz)} ·{' '}
                      {formatTimeInZone(start, otherTz)} –{' '}
                      {formatTimeInZone(end, otherTz)}
                      <span>
                        {otherUser.display_name || zoneCity(otherTz)}&rsquo;s time
                      </span>
                    </div>
                  )}
                </>
              )}
            </dd>
          </div>
          {event.recurrence_freq && (
            <div className="mb-3">
              <dt className="text-lg font-bold">Repeats</dt>
              <dd className="mt-0.5 text-base">
                {recurrenceLabel(event)}
                {event.recurrence_until && ` · until ${formatDateInZone(parseISO(event.recurrence_until), viewerTz)}`}
              </dd>
            </div>
          )}
          {event.location && (
            <div className="mb-3"><dt className="text-lg font-bold">Where</dt><dd className="mt-0.5 text-base">{event.location}</dd></div>
          )}
          {event.description && (
            <div className="mb-3"><dt className="text-lg font-bold">Notes</dt><dd className="mt-0.5 text-base">{event.description}</dd></div>
          )}
        </dl>
        {confirmDelete ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-ink">This event repeats — delete which?</p>
            <div className="mt-2.5 flex flex-wrap justify-end gap-2.5">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteOccurrence}>Just this one</button>
              <button className="btn btn-danger" onClick={deleteSeries}>Entire series</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2.5">
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
          </div>
        )}
      </div>
    </Backdrop>
  )
}

function FormMode({ initial, session, onClose }) {
  const editing = initial.mode === 'edit'
  const ev = initial.event
  // When editing a recurring occurrence, prefill from the series anchor (its
  // original first-occurrence times) so saving never silently shifts the series.
  const srcStart = editing ? ev.series_start_at || ev.start_at : null
  const srcEnd = editing ? ev.series_end_at || ev.end_at : null
  const baseDate = editing ? parseISO(srcStart) : (initial.date || new Date())
  const times = defaultTimes(baseDate, !editing && initial.atTime)

  const [title, setTitle] = useState(editing ? ev.title : '')
  const [description, setDescription] = useState(editing ? ev.description || '' : '')
  const [location, setLocation] = useState(editing ? ev.location || '' : '')
  // All-day events are stored at noon UTC, so their date is the UTC date
  // portion verbatim; reading it that way avoids any local-zone drift on edit.
  const [dateStr, setDateStr] = useState(
    editing && ev.all_day ? srcStart.slice(0, 10) : format(baseDate, 'yyyy-MM-dd')
  )
  const [allDay, setAllDay] = useState(editing ? ev.all_day : false)
  const [startTime, setStartTime] = useState(
    editing ? format(parseISO(srcStart), 'HH:mm') : format(times.start, 'HH:mm')
  )
  const [endTime, setEndTime] = useState(
    editing ? format(parseISO(srcEnd), 'HH:mm') : format(times.end, 'HH:mm')
  )
  const [isShared, setIsShared] = useState(editing ? ev.is_shared : false)
  const [remind, setRemind] = useState(editing && ev.remind_minutes != null ? String(ev.remind_minutes) : '')
  const [repeats, setRepeats] = useState(editing ? !!ev.recurrence_freq : false)
  const [recurFreq, setRecurFreq] = useState(editing && ev.recurrence_freq ? ev.recurrence_freq : 'weekly')
  const [recurUntil, setRecurUntil] = useState(
    editing && ev.recurrence_until ? String(ev.recurrence_until).slice(0, 10) : ''
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Editing one occurrence of a repeating series? Then offer a scope choice:
  // change the whole series, or "dissolve" just this occurrence out into its own
  // standalone event that no longer follows the schedule.
  const isRecurringOccurrence = editing && !!ev?.recurrence_freq
  const [scope, setScope] = useState('series') // 'series' | 'single'

  // Reseed the date/time fields from an instant pair. Switching scope re-points
  // them: "entire series" edits the series anchor (its first occurrence), while
  // "this occurrence" starts from this occurrence's own date and time.
  function seedTimes(startISO, endISO, allDayFlag) {
    if (allDayFlag) {
      setDateStr(String(startISO).slice(0, 10))
      return
    }
    setDateStr(format(parseISO(startISO), 'yyyy-MM-dd'))
    setStartTime(format(parseISO(startISO), 'HH:mm'))
    setEndTime(format(parseISO(endISO), 'HH:mm'))
  }

  function changeScope(next) {
    setScope(next)
    if (!isRecurringOccurrence) return
    if (next === 'single') seedTimes(ev.start_at, ev.end_at, ev.all_day)
    else seedTimes(srcStart, srcEnd, ev.all_day)
  }

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
        // which would drift the event onto the previous/next day for the other user
        // in another zone).
        start_at = `${dateStr}T12:00:00.000Z`
        end_at = `${dateStr}T12:00:00.000Z`
      } else {
        const startDate = new Date(`${dateStr}T${startTime}`)
        let endDate = new Date(`${dateStr}T${endTime}`)
        // An end at or before the start means the event runs past midnight, so
        // it ends the next day (e.g. 23:00–01:00). The week/day and month views
        // already clip spanning events into each day they touch.
        if (endDate <= startDate) {
          endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
        }
        start_at = startDate.toISOString()
        end_at = endDate.toISOString()
      }
      if (repeats && recurUntil && recurUntil < dateStr) {
        throw new Error('The repeat end date must be on or after the start date.')
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
        recurrence_freq: repeats ? recurFreq : null,
        recurrence_until: repeats && recurUntil ? recurUntil : null,
      }
      // "This occurrence" — dissolve just this one out of the series: create an
      // independent, non-repeating event carrying the (possibly edited) values,
      // and mark the original occurrence cancelled so the series stops
      // generating it. Everything else about the series is left untouched.
      if (isRecurringOccurrence && scope === 'single') {
        const occKey = ev.occurrenceKey || ev.series_start_at
        const { error: insErr } = await supabase
          .from('events')
          .insert({ ...payload, recurrence_freq: null, recurrence_until: null, overrides: null, owner_id: session.user.id })
        if (insErr) throw insErr
        const nextOverrides = { ...(ev.overrides || {}), [occKey]: { cancelled: true } }
        const { error: updErr } = await supabase.from('events').update({ overrides: nextOverrides }).eq('id', ev.id)
        if (updErr) throw updErr
        onClose()
        return
      }
      // Editing a recurring series re-times every occurrence, so any single
      // occurrences that were dragged elsewhere no longer line up — drop those
      // time overrides. Cancellations (dissolved/deleted occurrences) are kept
      // so they don't come back.
      if (editing && ev.recurrence_freq) {
        const timingChanged =
          start_at !== ev.series_start_at ||
          end_at !== ev.series_end_at ||
          payload.recurrence_freq !== ev.recurrence_freq ||
          (payload.recurrence_until || null) !== (ev.recurrence_until ? String(ev.recurrence_until).slice(0, 10) : null)
        if (timingChanged) {
          const kept = {}
          for (const [k, ov] of Object.entries(ev.overrides || {})) {
            if (ov && ov.cancelled) kept[k] = ov
          }
          payload.overrides = Object.keys(kept).length ? kept : null
        }
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
      <form className={MODAL} onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold">{editing ? 'Edit event' : 'New event'}</h2>
        {isRecurringOccurrence && (
          <div>
            <span className="field-label">Apply changes to</span>
            <label className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="radio" name="scope" className="h-4 w-4" checked={scope === 'series'} onChange={() => changeScope('series')} />
              The entire series
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="radio" name="scope" className="h-4 w-4" checked={scope === 'single'} onChange={() => changeScope('single')} />
              This event only
            </label>
          </div>
        )}

        <label className="field-label">
          Title
          <input autoFocus required className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner with Mom" />
        </label>

        <label className="field-label">
          Date
          <input type="date" required className="field" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>

        <label className="mt-3.5 flex items-center gap-2 font-semibold text-ink">
          <input type="checkbox" className="h-4 w-4" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        {!allDay && (
          <div className="flex gap-3">
            <label className="field-label flex-1">
              Start
              <input type="time" required className="field" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="field-label flex-1">
              End
              <input type="time" required className="field" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        )}

        {scope !== 'single' && (
          <label className="mt-3.5 flex items-center gap-2 font-semibold text-ink">
            <input type="checkbox" className="h-4 w-4" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            Repeats
          </label>
        )}

        {scope !== 'single' && repeats && (
          <>
            <div className="flex gap-3">
              <label className="field-label flex-1">
                How often
                <select className="field" value={recurFreq} onChange={(e) => setRecurFreq(e.target.value)}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="field-label flex-1">
                Until
                <input type="date" className="field" value={recurUntil} min={dateStr} onChange={(e) => setRecurUntil(e.target.value)} />
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">Leave “Until” empty to repeat with no end date.</p>
          </>
        )}

        <label className="field-label">
          Location
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
        </label>

        <label className="field-label">
          Notes
          <textarea className="field resize-y" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
        </label>

        <label className="field-label">
          Reminder
          <select className="field" value={remind} onChange={(e) => setRemind(e.target.value)}>
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="mt-3.5 flex items-center gap-2 rounded-sm bg-shared/15 px-3 py-2.5 font-semibold text-ink">
          <input type="checkbox" className="h-4 w-4" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          Shared event (belongs to both of us)
        </label>

        {error && <div className="mt-3.5 rounded-sm bg-danger/15 px-3 py-2.5 text-sm text-danger-strong">{error}</div>}

        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }) {
  return (
    // Padding uses max(gap, safe-area inset) so the dialog never tucks under a
    // notch or the home indicator on iPhones (the fixed overlay spans the whole
    // screen, ignoring the body's safe-area padding).
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm"
      style={{ padding: SAFE_PAD }}
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// Safe-area-aware overlay padding, shared by the modals.
export const SAFE_PAD =
  'max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left))'

const MODAL = 'relative max-h-[90dvh] w-full overflow-y-auto rounded-sm bg-surface p-5 shadow-[0_20px_60px_rgba(63,58,71,0.3)] sm:p-7'
