import { useEffect, useMemo, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameMonth,
  isSameYear,
  format,
  isToday,
  parseISO,
} from 'date-fns'
import { supabase } from '../lib/supabaseClient'
import { useEvents } from '../hooks/useEvents'
import { useProfiles } from '../hooks/useProfiles'
import { useReminders, requestNotificationPermission } from '../hooks/useReminders'
import { browserTimeZone } from '../lib/time'
import EventModal from './EventModal'
import SettingsModal from './SettingsModal'
import TimeGridView from './TimeGridView'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const VIEWS = ['month', 'week', 'day']

export default function CalendarView({ session }) {
  const userId = session.user.id
  const [cursor, setCursor] = useState(new Date())
  const [view, setView] = useState('month')
  const { profiles } = useProfiles()
  const [modal, setModal] = useState(null) // { mode, event?, date? } or null
  const [showSettings, setShowSettings] = useState(false)

  // The visible date range depends on the view. Month spans full weeks so the
  // grid is always rectangular; week is Mon–Sun; day is a single date.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      return {
        rangeStart: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        rangeEnd: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      }
    }
    if (view === 'week') {
      return {
        rangeStart: startOfWeek(cursor, { weekStartsOn: 1 }),
        rangeEnd: endOfWeek(cursor, { weekStartsOn: 1 }),
      }
    }
    return { rangeStart: startOfDay(cursor), rangeEnd: endOfDay(cursor) }
  }, [view, cursor])

  const { events, loading } = useEvents(rangeStart, rangeEnd)
  useReminders(events)

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Keep this user's stored zone in sync with their device so the partner always
  // sees this person's events in the right local time (even after they travel).
  const myTz = profiles[userId]?.timezone
  useEffect(() => {
    if (!profiles[userId]) return // profile not loaded yet
    const current = browserTimeZone()
    if (myTz === current) return
    supabase
      .from('profiles')
      .update({ timezone: current })
      .eq('id', userId)
      .then(({ error }) => {
        // Silent: a missing column (pre-migration) or transient error shouldn't
        // break the calendar; alignment still works via the browser's own zone.
        if (error) console.warn('Could not save timezone:', error.message)
      })
  }, [userId, myTz, profiles])

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart.getTime(), rangeEnd.getTime()]
  )

  // Group events by calendar day (an event can span multiple days). Used by the
  // month grid; the time-grid views do their own per-day layout.
  const eventsByDay = useMemo(() => {
    const map = {}
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      map[key] = events.filter((ev) => {
        const s = parseISO(ev.start_at)
        const e = parseISO(ev.end_at)
        return day >= startOfDay(s) && day <= startOfDay(e)
      })
    }
    return map
  }, [days, events])

  // The chip color comes from the owner's chosen profile color; shared events
  // get a distinct gradient handled in CSS.
  function ownerColor(ev) {
    return profiles[ev.owner_id]?.color || (ev.owner_id === userId ? '#7c6fd6' : '#4a90e2')
  }

  function step(dir) {
    if (view === 'month') setCursor((c) => (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)))
    else if (view === 'week') setCursor((c) => (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)))
    else setCursor((c) => (dir > 0 ? addDays(c, 1) : subDays(c, 1)))
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const me = profiles[userId]
  const myName = me?.display_name || session.user.email.split('@')[0]
  const myColor = me?.color || '#7c6fd6'
  const partner = Object.values(profiles).find((p) => p.id !== userId)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Our Calendar</div>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">‹</button>
          <h2>{title(view, cursor, rangeStart, rangeEnd)}</h2>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">›</button>
          <button className="btn ghost today-btn" onClick={() => setCursor(new Date())}>Today</button>
        </div>
        <div className="topbar-right">
          <div className="view-switch">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`view-btn ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <span className="legend">
            <span className="dot" style={{ background: myColor }} /> {myName}
            {partner && (
              <>
                <span className="dot" style={{ background: partner.color }} /> {partner.display_name}
              </>
            )}
            <span className="dot shared" /> Shared
          </span>
          <button className="btn primary" onClick={() => setModal({ mode: 'create', date: new Date() })}>+ New event</button>
          <button className="btn ghost" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {view === 'month' ? (
        <>
          <div className="weekday-row">
            {WEEKDAYS.map((d) => (
              <div key={d} className="weekday">{d}</div>
            ))}
          </div>

          <div className="month-grid">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDay[key] || []
              return (
                <div
                  key={key}
                  className={[
                    'day-cell',
                    isSameMonth(day, cursor) ? '' : 'outside',
                    isToday(day) ? 'today' : '',
                  ].join(' ').trim()}
                  onClick={() => setModal({ mode: 'create', date: day })}
                >
                  <div className="day-number">{format(day, 'd')}</div>
                  <div className="day-events">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        className={`event-chip ${ev.is_shared ? 'shared' : ''}`}
                        style={ev.is_shared ? undefined : { background: ownerColor(ev) }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setModal({ mode: 'view', event: ev })
                        }}
                        title={ev.title}
                      >
                        {!ev.all_day && (
                          <span className="chip-time">{format(parseISO(ev.start_at), 'HH:mm')}</span>
                        )}
                        <span className="chip-title">{ev.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <TimeGridView
          days={days}
          events={events}
          userId={userId}
          profiles={profiles}
          onSelectEvent={(ev) => setModal({ mode: 'view', event: ev })}
          onSelectSlot={(date) => setModal({ mode: 'create', date })}
        />
      )}

      {loading && <div className="loading-bar">Loading…</div>}

      {modal && (
        <EventModal
          session={session}
          profiles={profiles}
          initial={modal}
          onClose={() => setModal(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          session={session}
          profile={me}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// Heading text for the current view and date range.
function title(view, cursor, rangeStart, rangeEnd) {
  if (view === 'month') return format(cursor, 'MMMM yyyy')
  if (view === 'day') return format(cursor, 'EEEE, MMM d, yyyy')
  // week: "Jun 16 – 22, 2026" or spanning months/years when needed.
  if (!isSameYear(rangeStart, rangeEnd)) {
    return `${format(rangeStart, 'MMM d, yyyy')} – ${format(rangeEnd, 'MMM d, yyyy')}`
  }
  if (!isSameMonth(rangeStart, rangeEnd)) {
    return `${format(rangeStart, 'MMM d')} – ${format(rangeEnd, 'MMM d, yyyy')}`
  }
  return `${format(rangeStart, 'MMM d')} – ${format(rangeEnd, 'd, yyyy')}`
}
