import { useEffect, useMemo, useRef } from 'react'
import { format, isToday, parseISO } from 'date-fns'

const HOUR_HEIGHT = 48 // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// A scrollable hour-by-hour grid used by both the week view (7 day columns)
// and the day view (1 column). Timed events are positioned by their start/end;
// all-day events sit in a strip above the grid.
export default function TimeGridView({ days, events, userId, profiles, onSelectEvent, onSelectSlot }) {
  const scrollRef = useRef(null)

  // Start scrolled to ~7am so the morning is visible without scrolling up.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT
  }, [])

  function ownerColor(ev) {
    return profiles[ev.owner_id]?.color || (ev.owner_id === userId ? '#7c6fd6' : '#4a90e2')
  }

  // Split events per day into all-day vs timed, with timed laid out in columns.
  const perDay = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime()
      const dayEnd = dayStart + 24 * 60 * 60 * 1000
      const allDay = []
      const timed = []
      for (const ev of events) {
        const s = parseISO(ev.start_at).getTime()
        const e = parseISO(ev.end_at).getTime()
        if (e <= dayStart || s >= dayEnd) continue // doesn't touch this day
        if (ev.all_day) {
          allDay.push(ev)
        } else {
          const cs = Math.max(s, dayStart)
          const ce = Math.min(e, dayEnd)
          timed.push({ ev, top: minutesFrom(dayStart, cs), height: Math.max((ce - cs) / 60000, 20) })
        }
      }
      return { day, allDay, timed: layout(timed) }
    })
  }, [days, events])

  const isSingleDay = days.length === 1

  return (
    <div className={`timegrid ${isSingleDay ? 'day-view' : 'week-view'}`}>
      <div className="tg-head">
        <div className="tg-gutter-head" />
        {perDay.map(({ day }) => (
          <div key={day.toISOString()} className={`tg-day-head ${isToday(day) ? 'today' : ''}`}>
            <span className="tg-dow">{format(day, 'EEE')}</span>
            <span className="tg-date">{format(day, 'd')}</span>
          </div>
        ))}
      </div>

      <div className="tg-allday">
        <div className="tg-gutter-head tg-allday-label">all-day</div>
        {perDay.map(({ day, allDay }) => (
          <div key={day.toISOString()} className="tg-allday-col">
            {allDay.map((ev) => (
              <button
                key={ev.id}
                className={`event-chip ${ev.is_shared ? 'shared' : ''}`}
                style={ev.is_shared ? undefined : { background: ownerColor(ev) }}
                onClick={() => onSelectEvent(ev)}
                title={ev.title}
              >
                <span className="chip-title">{ev.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="tg-body" ref={scrollRef}>
        <div className="tg-gutter">
          {HOURS.map((h) => (
            <div key={h} className="tg-hour-label" style={{ height: HOUR_HEIGHT }}>
              {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'HH:mm')}
            </div>
          ))}
        </div>
        {perDay.map(({ day, timed }) => (
          <div
            key={day.toISOString()}
            className="tg-col"
            style={{ height: HOUR_HEIGHT * 24 }}
            onClick={(e) => handleColumnClick(e, day, onSelectSlot)}
          >
            {HOURS.map((h) => (
              <div key={h} className="tg-hour-line" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {timed.map(({ ev, top, height, lane, lanes }) => (
              <button
                key={ev.id}
                className={`tg-event ${ev.is_shared ? 'shared' : ''}`}
                style={{
                  top: (top / 60) * HOUR_HEIGHT,
                  height: (height / 60) * HOUR_HEIGHT - 2,
                  left: `calc(${(lane / lanes) * 100}% + 2px)`,
                  width: `calc(${100 / lanes}% - 4px)`,
                  ...(ev.is_shared ? {} : { background: ownerColor(ev) }),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectEvent(ev)
                }}
                title={ev.title}
              >
                <span className="tg-event-time">{format(parseISO(ev.start_at), 'HH:mm')}</span>
                <span className="tg-event-title">{ev.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Clicking an empty part of a day column opens the new-event form at that hour.
function handleColumnClick(e, day, onSelectSlot) {
  const rect = e.currentTarget.getBoundingClientRect()
  const y = e.clientY - rect.top
  const hour = Math.min(23, Math.max(0, Math.floor(y / HOUR_HEIGHT)))
  const d = new Date(day)
  d.setHours(hour, 0, 0, 0)
  onSelectSlot(d)
}

// Greedy column packing so overlapping events sit side by side instead of
// stacking on top of each other.
function layout(items) {
  const sorted = [...items].sort((a, b) => a.top - b.top || b.height - a.height)
  // Break into clusters of mutually overlapping events.
  const clusters = []
  let current = []
  let clusterEnd = -Infinity
  for (const it of sorted) {
    if (it.top >= clusterEnd && current.length) {
      clusters.push(current)
      current = []
    }
    current.push(it)
    clusterEnd = Math.max(clusterEnd, it.top + it.height)
  }
  if (current.length) clusters.push(current)

  const result = []
  for (const cluster of clusters) {
    const lanes = [] // each lane holds the end-time of its last event
    for (const it of cluster) {
      let placed = false
      for (let i = 0; i < lanes.length; i++) {
        if (it.top >= lanes[i]) {
          lanes[i] = it.top + it.height
          it.lane = i
          placed = true
          break
        }
      }
      if (!placed) {
        it.lane = lanes.length
        lanes.push(it.top + it.height)
      }
    }
    const laneCount = lanes.length
    for (const it of cluster) result.push({ ...it, lanes: laneCount })
  }
  return result
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function minutesFrom(baseMs, ms) {
  return (ms - baseMs) / 60000
}
