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
  setMonth,
  setYear,
  getMonth,
  getYear,
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
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// A range of years to jump between via the dropdown, centered on the present.
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 11 }, (_, i) => THIS_YEAR - 4 + i)

export default function CalendarView({ session }) {
  const userId = session.user.id
  const [cursor, setCursor] = useState(new Date())
  const [view, setView] = useState('month')
  const { profiles } = useProfiles()
  const [modal, setModal] = useState(null) // { mode, event?, date? } or null
  const [showSettings, setShowSettings] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

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

  // Each event carries its own chosen color; default to pastel purple.
  function eventColor(ev) {
    return ev.color || '#a99ce6'
  }

  // Whose event it is, shown inline on each chip (replaces the color legend).
  function ownerLabel(ev) {
    if (ev.is_shared) return 'Shared'
    if (ev.owner_id === userId) return myName
    return profiles[ev.owner_id]?.display_name || 'Partner'
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

  return (
    <div className="mx-auto max-w-[1200px] p-5">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <div className="text-xl leading-none font-bold text-mine-strong">Calendar</div>
        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button className="flex h-9 w-7 items-center justify-center rounded-sm text-2xl leading-none text-mine-strong hover:bg-canvas" onClick={() => step(-1)} aria-label="Previous">‹</button>
            <button
              type="button"
              className="flex h-9 items-center justify-center gap-1 rounded-sm px-2 text-lg font-semibold hover:bg-canvas"
              onClick={() => setPickerOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={pickerOpen}
            >
              {title(view, cursor, rangeStart, rangeEnd)}
              <span className="text-xs text-muted">▾</span>
            </button>
            <button className="flex h-9 w-7 items-center justify-center rounded-sm text-2xl leading-none text-mine-strong hover:bg-canvas" onClick={() => step(1)} aria-label="Next">›</button>
          </div>
          <button className="btn btn-ghost px-3 py-1.5" onClick={() => setCursor(new Date())}>Today</button>

          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute top-full left-0 z-20 mt-1 flex gap-2 rounded-sm border border-line bg-surface p-2 shadow-[0_8px_30px_rgba(120,110,160,0.18)]">
                <select
                  className="rounded-sm border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-mine focus:outline-none"
                  value={getMonth(cursor)}
                  onChange={(e) => setCursor(setMonth(cursor, Number(e.target.value)))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  className="rounded-sm border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-mine focus:outline-none"
                  value={getYear(cursor)}
                  onChange={(e) => setCursor(setYear(cursor, Number(e.target.value)))}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-0.5 rounded-sm border border-line bg-surface p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`rounded-sm px-3 py-1.5 text-sm font-semibold ${
                  view === v ? 'bg-mine text-white' : 'text-muted hover:text-mine-strong'
                }`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', date: new Date() })}>+ New event</button>
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {view === 'month' ? (
        <>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1.5 text-center text-xs font-bold tracking-wide text-muted uppercase">{d}</div>
            ))}
          </div>

          <div className="grid min-h-[calc(100dvh-150px)] grid-cols-7 gap-2 [grid-auto-rows:minmax(108px,1fr)] max-sm:gap-1 max-sm:[grid-auto-rows:minmax(84px,1fr)]">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDay[key] || []
              const outside = !isSameMonth(day, cursor)
              const today = isToday(day)
              return (
                <div
                  key={key}
                  className={`flex cursor-pointer flex-col gap-1 overflow-hidden rounded-sm border p-2 hover:border-mine ${
                    today ? 'border-mine' : 'border-transparent'
                  } ${outside ? 'bg-surface/50' : 'bg-surface'}`}
                  onClick={() => setModal({ mode: 'create', date: day })}
                >
                  <div
                    className={`text-sm font-bold ${
                      today
                        ? 'grid h-[26px] w-[26px] place-items-center rounded-sm bg-mine text-white'
                        : outside
                        ? 'text-muted'
                        : ''
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        className="chip"
                        style={{ background: eventColor(ev) }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setModal({ mode: 'view', event: ev })
                        }}
                        title={`${ev.title} — ${ownerLabel(ev)}`}
                      >
                        <span className="shrink-0 font-semibold opacity-90">
                          {ev.all_day ? ownerLabel(ev) : `${format(parseISO(ev.start_at), 'HH:mm')} · ${ownerLabel(ev)}`}
                        </span>
                        <span className="overflow-hidden text-ellipsis">{ev.title}</span>
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

      {loading && <div className="p-4 text-center text-muted">Loading…</div>}

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
