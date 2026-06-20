import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'

const HOUR_HEIGHT = 48 // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// A scrollable hour-by-hour grid used by both the week view (7 day columns)
// and the day view (1 column). Timed events are positioned by their start/end;
// all-day events sit in a row at the top of the scroller (scrolling with it).
export default function TimeGridView({ days, events, userId, profiles, onSelectEvent, onSelectSlot }) {
  const scrollRef = useRef(null)
  const hourGridRef = useRef(null)
  const [gutter, setGutter] = useState(0)

  // Start scrolled to ~7am so the morning is visible without scrolling up. The
  // all-day row lives above the hour grid in the same scroller, so offset the
  // target by the grid's own top position.
  useEffect(() => {
    const body = scrollRef.current
    const grid = hourGridRef.current
    if (body && grid) body.scrollTop = grid.offsetTop + 7 * HOUR_HEIGHT
  }, [days.length])

  // The scrolling body loses its right edge to a scrollbar; the day-name header
  // doesn't scroll, so we pad it by the measured scrollbar width to keep every
  // day column aligned with the grid below.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setGutter(el.offsetWidth - el.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [days.length])

  // Each event carries its own chosen color; default to pastel purple.
  function eventColor(ev) {
    return ev.color || '#a99ce6'
  }

  // Whose event it is, shown inline on each event (replaces the color legend).
  function ownerLabel(ev) {
    if (ev.is_shared) return 'Shared'
    if (ev.owner_id === userId) return profiles[userId]?.display_name || 'You'
    return profiles[ev.owner_id]?.display_name || 'Partner'
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

  const gridCols = { gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }
  // Header and all-day rows reserve the scrollbar's width on the right so their
  // columns line up with the scrolling body below.
  const headCols = { ...gridCols, paddingRight: gutter }

  return (
    <div className="overflow-hidden rounded-sm bg-surface shadow-[0_8px_30px_rgba(120,110,160,0.12)]">
      <div className="grid border-b border-line" style={headCols}>
        <div />
        {perDay.map(({ day }) => (
          <div key={day.toISOString()} className="flex flex-col gap-0.5 border-l border-line px-1 py-2 text-center">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">{format(day, 'EEE')}</span>
            <span
              className={`text-lg font-bold ${
                isToday(day) ? 'mx-auto grid h-7 w-7 place-items-center rounded-sm bg-mine text-white' : ''
              }`}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      <div className="relative max-h-[calc(100dvh-200px)] overflow-y-auto" ref={scrollRef}>
        {/* All-day row — a normal row at the top that scrolls with the grid. */}
        <div className="grid border-b border-line" style={gridCols}>
          <div className="flex items-start justify-end pt-1.5 pr-1.5 text-[0.66rem] font-bold tracking-wide text-muted uppercase">all-day</div>
          {perDay.map(({ day, allDay }) => (
            <div key={day.toISOString()} className="flex min-h-[34px] flex-col gap-0.5 border-l border-line p-1">
              {allDay.map((ev) => (
                <button
                  key={ev.id}
                  className="chip"
                  style={{ background: eventColor(ev) }}
                  onClick={() => onSelectEvent(ev)}
                  title={`${ev.title} — ${ownerLabel(ev)}`}
                >
                  <span className="shrink-0 font-semibold opacity-90">{ownerLabel(ev)}</span>
                  <span className="overflow-hidden text-ellipsis">{ev.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Hour grid. */}
        <div className="grid" style={gridCols} ref={hourGridRef}>
          <div className="relative">
            {HOURS.map((h) => (
              <div key={h} className="-translate-y-[7px] pr-1.5 text-right text-[0.7rem] text-muted" style={{ height: HOUR_HEIGHT }}>
                {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'HH:mm')}
              </div>
            ))}
          </div>
          {perDay.map(({ day, timed }) => (
            <div
              key={day.toISOString()}
              className="relative border-l border-line"
              style={{ height: HOUR_HEIGHT * 24 }}
              onClick={(e) => handleColumnClick(e, day, onSelectSlot)}
            >
              {HOURS.map((h) => (
                <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line" style={{ top: h * HOUR_HEIGHT }} />
              ))}
              {timed.map(({ ev, top, height, lane, lanes }) => (
                <button
                  key={ev.id}
                  className="absolute flex flex-col overflow-hidden rounded-sm px-1.5 py-0.5 text-left text-[0.72rem] leading-tight text-white shadow-sm hover:z-[5] hover:brightness-105"
                  style={{
                    top: (top / 60) * HOUR_HEIGHT,
                    height: (height / 60) * HOUR_HEIGHT - 2,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                    background: eventColor(ev),
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectEvent(ev)
                  }}
                  title={`${ev.title} — ${ownerLabel(ev)}`}
                >
                  <span className="font-bold opacity-90">{format(parseISO(ev.start_at), 'HH:mm')} · {ownerLabel(ev)}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{ev.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
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
