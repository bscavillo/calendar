import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'
import { eventColor } from '../lib/eventColor'

const MIN_HOUR_HEIGHT = 48 // px per hour (short screens / minimum)
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// A scrollable hour-by-hour grid used by both the week view (7 day columns)
// and the day view (1 column). Everything lives in one scroll container: the
// day-name header sticks to the top, the time gutter sticks to the left, and on
// narrow screens the week's columns keep a minimum width so the grid scrolls
// horizontally instead of squashing.
export default function TimeGridView({ days, events, userId, profiles, onSelectEvent, onSelectSlot }) {
  const scrollRef = useRef(null)
  const headRef = useRef(null)
  const allDayRef = useRef(null)
  const hourGridRef = useRef(null)
  const [hourHeight, setHourHeight] = useState(MIN_HOUR_HEIGHT)

  // Size the 24 hour rows to fill the scroller, so the whole day is visible
  // without vertical scrolling on a tall (desktop) viewport. On short screens
  // the rows bottom out at MIN_HOUR_HEIGHT and the grid scrolls instead.
  useLayoutEffect(() => {
    const body = scrollRef.current
    if (!body) return
    const measure = () => {
      const headH = headRef.current?.offsetHeight || 0
      const allDayH = allDayRef.current?.offsetHeight || 0
      const available = body.clientHeight - headH - allDayH
      setHourHeight(Math.max(MIN_HOUR_HEIGHT, Math.floor(available / 24)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    return () => ro.disconnect()
  }, [days.length])

  // Start scrolled to ~7am so the morning is visible when the grid does scroll
  // (short screens). The header and all-day row share the scroller, so offset
  // past them and back up by the sticky header's height.
  useEffect(() => {
    const body = scrollRef.current
    const grid = hourGridRef.current
    if (!body || !grid) return
    const headH = headRef.current ? headRef.current.offsetHeight : 0
    body.scrollTop = Math.max(grid.offsetTop - headH + 7 * hourHeight, 0)
  }, [days.length, hourHeight])

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

  // Columns share the available width equally (minmax(0,…) lets them shrink), so
  // the whole week fits on a phone without horizontal scrolling — like the month.
  const gridCols = { gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[70dvh] overflow-auto rounded-sm bg-surface shadow-[0_8px_30px_rgba(120,110,160,0.12)] sm:max-h-none sm:h-[calc(100dvh-180px)]"
    >
      {/* Day-name header: sticks to the top on vertical scroll, moves with the
          grid on horizontal scroll. */}
      <div ref={headRef} className="sticky top-0 z-20 grid border-b border-line bg-surface" style={gridCols}>
        <div className="sticky left-0 z-30 bg-surface" />
        {perDay.map(({ day }) => (
          <div key={day.toISOString()} className="flex flex-col gap-0.5 border-l border-line px-1 py-2 text-center">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">{format(day, 'EEE')}</span>
            <span
              className={`text-lg font-bold ${
                isToday(day) ? 'mx-auto grid h-7 w-7 place-items-center rounded-sm bg-accent text-white' : ''
              }`}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* All-day row — a normal row that scrolls with the grid. */}
      <div ref={allDayRef} className="grid border-b border-line" style={gridCols}>
        <div className="sticky left-0 z-10 bg-surface pt-1.5 pr-1.5 text-right text-xs whitespace-nowrap text-muted font-bold">All-day</div>
        {perDay.map(({ day, allDay }) => (
          <div key={day.toISOString()} className="flex min-h-[34px] flex-col gap-0.5 border-l border-line p-1">
            {allDay.map((ev) => (
              <button
                key={ev.instanceKey || ev.id}
                className="chip"
                style={{ background: eventColor(ev, userId) }}
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
        <div className="sticky left-0 z-10 bg-surface">
          {HOURS.map((h) => (
            <div key={h} className="-translate-y-[7px] pr-1.5 text-right text-[0.7rem] text-muted" style={{ height: hourHeight }}>
              {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'HH:mm')}
            </div>
          ))}
        </div>
        {perDay.map(({ day, timed }) => (
          <div
            key={day.toISOString()}
            className="relative border-l border-line"
            style={{ height: hourHeight * 24 }}
            onClick={(e) => handleColumnClick(e, day, onSelectSlot, hourHeight)}
          >
            {HOURS.map((h) => (
              <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line" style={{ top: h * hourHeight }} />
            ))}
            {timed.map(({ ev, top, height, lane, lanes }) => (
              <button
                key={ev.instanceKey || ev.id}
                className="absolute flex flex-col overflow-hidden rounded-sm px-1.5 py-0.5 text-left text-[0.72rem] leading-tight text-white shadow-sm hover:z-[5] hover:brightness-105"
                style={{
                  top: (top / 60) * hourHeight,
                  height: (height / 60) * hourHeight - 2,
                  left: `calc(${(lane / lanes) * 100}% + 2px)`,
                  width: `calc(${100 / lanes}% - 4px)`,
                  background: eventColor(ev, userId),
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
  )
}

// Clicking an empty part of a day column opens the new-event form at that hour.
function handleColumnClick(e, day, onSelectSlot, hourHeight) {
  const rect = e.currentTarget.getBoundingClientRect()
  const y = e.clientY - rect.top
  const hour = Math.min(23, Math.max(0, Math.floor(y / hourHeight)))
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
