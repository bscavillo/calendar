import { useEffect, useMemo, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns'
import { supabase } from '../lib/supabaseClient'
import { useEvents } from '../hooks/useEvents'
import { useReminders, requestNotificationPermission } from '../hooks/useReminders'
import EventModal from './EventModal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarView({ session }) {
  const userId = session.user.id
  const [cursor, setCursor] = useState(new Date())
  const [profiles, setProfiles] = useState({})
  const [modal, setModal] = useState(null) // { mode, event?, date? } or null

  // Calendar grid spans full weeks around the visible month.
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const { events, loading } = useEvents(gridStart, gridEnd)
  useReminders(events)

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Load display names so we can label whose event is whose.
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name')
      .then(({ data }) => {
        if (!data) return
        const map = {}
        for (const p of data) map[p.id] = p.display_name
        setProfiles(map)
      })
  }, [])

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart.getTime(), gridEnd.getTime()]
  )

  // Group events by calendar day (an event can span multiple days).
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

  function eventKind(ev) {
    if (ev.is_shared) return 'shared'
    return ev.owner_id === userId ? 'mine' : 'partner'
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const myName = profiles[userId] || session.user.email.split('@')[0]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">💜 Our Calendar</div>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => setCursor(subMonths(cursor, 1))} aria-label="Previous month">‹</button>
          <h2>{format(cursor, 'MMMM yyyy')}</h2>
          <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">›</button>
          <button className="btn ghost today-btn" onClick={() => setCursor(new Date())}>Today</button>
        </div>
        <div className="topbar-right">
          <span className="legend">
            <span className="dot mine" /> {myName}
            <span className="dot partner" /> Partner
            <span className="dot shared" /> Shared
          </span>
          <button className="btn primary" onClick={() => setModal({ mode: 'create', date: new Date() })}>+ New event</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

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
                    className={`event-chip ${eventKind(ev)}`}
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

      {loading && <div className="loading-bar">Loading…</div>}

      {modal && (
        <EventModal
          session={session}
          profiles={profiles}
          initial={modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// Local helper: midnight of a given date (avoids importing one more fn).
function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
