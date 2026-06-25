import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'
import { eventColor } from '../lib/eventColor'

const MIN_HOUR_HEIGHT = 48 // px per hour (short screens / minimum)
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const SNAP_MIN = 15 // dragged events snap to a 15-minute grid
const DRAG_THRESHOLD = 4 // px of movement before a press counts as a drag (vs a click)
const DAY_MS = 24 * 60 * 60 * 1000

// A scrollable hour-by-hour grid used by both the week view (7 day columns)
// and the day view (1 column). Everything lives in one scroll container: the
// day-name header sticks to the top, the time gutter sticks to the left, and on
// narrow screens the week's columns keep a minimum width so the grid scrolls
// horizontally instead of squashing.
export default function TimeGridView({ days, events, userId, profiles, onSelectEvent, onSelectSlot, onMoveEvent }) {
  const scrollRef = useRef(null)
  const headRef = useRef(null)
  const allDayRef = useRef(null)
  const hourGridRef = useRef(null)
  const colRefs = useRef([]) // one DOM node per day column, for drag hit-testing
  const dragRef = useRef(null) // live drag state (mutable, avoids stale closures)
  const justDraggedRef = useRef(false) // swallow the click that follows a drag
  const [hourHeight, setHourHeight] = useState(MIN_HOUR_HEIGHT)
  // While a moved event's new time is in flight, show it where it was dropped so
  // it doesn't snap back to the old spot before realtime delivers the update.
  const [optimistic, setOptimistic] = useState(null) // { key, start_at, end_at } | null
  const [drag, setDrag] = useState(null) // { dayIndex, startMin, durationMin } | null while dragging

  // Clear the optimistic position once fresh events arrive (our update echoed
  // back, or any other change) — the real data now reflects the move.
  useEffect(() => {
    setOptimistic(null)
  }, [events])

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

  // Begin a press on a timed event. It only becomes a real drag once the pointer
  // moves past a small threshold, so a plain click still opens the event. While
  // dragging we track the target day column and snapped start minute, then on
  // release hand the new start/end to onMoveEvent.
  function startDrag(e, ev, dayIndex, topMin) {
    if (e.button != null && e.button !== 0) return // left button / touch only
    const rect = e.currentTarget.getBoundingClientRect()
    const durationMs = parseISO(ev.end_at).getTime() - parseISO(ev.start_at).getTime()
    const d = {
      ev,
      key: ev.instanceKey || ev.id,
      color: eventColor(ev, userId),
      durationMs,
      durationMin: durationMs / 60000,
      grabOffsetY: e.clientY - rect.top, // keep the grabbed point under the cursor
      startClientX: e.clientX,
      startClientY: e.clientY,
      dayIndex,
      startMin: topMin,
      started: false,
    }
    dragRef.current = d
    justDraggedRef.current = false

    const onMove = (me) => {
      const drag = dragRef.current
      if (!drag) return
      if (!drag.started) {
        if (
          Math.abs(me.clientX - drag.startClientX) < DRAG_THRESHOLD &&
          Math.abs(me.clientY - drag.startClientY) < DRAG_THRESHOLD
        )
          return
        drag.started = true
      }
      me.preventDefault()
      // Which day column is the pointer over? Fall back to the current one.
      let idx = drag.dayIndex
      const cols = colRefs.current
      for (let i = 0; i < cols.length; i++) {
        const r = cols[i]?.getBoundingClientRect()
        if (r && me.clientX >= r.left && me.clientX < r.right) {
          idx = i
          break
        }
      }
      const r = cols[idx]?.getBoundingClientRect()
      if (!r) return
      const localY = me.clientY - r.top - drag.grabOffsetY
      const raw = (localY / hourHeight) * 60
      let startMin = Math.round(raw / SNAP_MIN) * SNAP_MIN
      startMin = Math.max(0, Math.min(startMin, 24 * 60 - drag.durationMin))
      drag.dayIndex = idx
      drag.startMin = startMin
      setDrag({ dayIndex: idx, startMin, durationMin: drag.durationMin })
    }

    const finish = (commit) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      const drag = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!drag || !drag.started) return // never moved → leave the click to fire
      if (!commit) return
      const base = startOfDay(days[drag.dayIndex]).getTime()
      const startMs = base + drag.startMin * 60000
      const startISO = new Date(startMs).toISOString()
      const endISO = new Date(startMs + drag.durationMs).toISOString()
      justDraggedRef.current = true // swallow the trailing click on the source/column
      setTimeout(() => (justDraggedRef.current = false), 0) // …but only that one click
      setOptimistic({ key: drag.key, start_at: startISO, end_at: endISO })
      Promise.resolve(onMoveEvent?.(drag.ev, startISO, endISO)).catch(() => setOptimistic(null))
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  // Split events per day into all-day vs timed, with timed laid out in columns.
  // A pending (optimistic) move overrides the matching event's times so it
  // renders in its dropped slot — including landing in a different day column.
  const perDay = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime()
      const dayEnd = dayStart + DAY_MS
      const allDay = []
      const timed = []
      for (const ev of events) {
        const moved = optimistic && (ev.instanceKey || ev.id) === optimistic.key
        const startISO = moved ? optimistic.start_at : ev.start_at
        const endISO = moved ? optimistic.end_at : ev.end_at
        const s = parseISO(startISO).getTime()
        const e = parseISO(endISO).getTime()
        if (e <= dayStart || s >= dayEnd) continue // doesn't touch this day
        if (ev.all_day) {
          allDay.push(ev)
        } else {
          const cs = Math.max(s, dayStart)
          const ce = Math.min(e, dayEnd)
          timed.push({ ev, startISO, top: minutesFrom(dayStart, cs), height: Math.max((ce - cs) / 60000, 20) })
        }
      }
      return { day, allDay, timed: layout(timed) }
    })
  }, [days, events, optimistic])

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
        {perDay.map(({ day, timed }, dayIndex) => (
          <div
            key={day.toISOString()}
            ref={(el) => (colRefs.current[dayIndex] = el)}
            className="relative border-l border-line"
            style={{ height: hourHeight * 24 }}
            onClick={(e) => {
              if (justDraggedRef.current) return // ignore the click that ends a drag
              handleColumnClick(e, day, onSelectSlot, hourHeight)
            }}
          >
            {HOURS.map((h) => (
              <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line" style={{ top: h * hourHeight }} />
            ))}
            {timed.map(({ ev, startISO, top, height, lane, lanes }) => {
              const dragging = drag && (ev.instanceKey || ev.id) === dragRef.current?.key
              return (
                <button
                  key={ev.instanceKey || ev.id}
                  className={`absolute flex touch-none flex-col overflow-hidden rounded-sm px-1.5 py-0.5 text-left text-[0.72rem] leading-tight text-white shadow-sm hover:z-[5] hover:brightness-105 ${
                    dragging ? 'opacity-30' : ''
                  }`}
                  style={{
                    top: (top / 60) * hourHeight,
                    height: (height / 60) * hourHeight - 2,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                    background: eventColor(ev, userId),
                  }}
                  onPointerDown={(e) => startDrag(e, ev, dayIndex, top)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (justDraggedRef.current) return // a drop, not a click
                    onSelectEvent(ev)
                  }}
                  title={`${ev.title} — ${ownerLabel(ev)}`}
                >
                  <span className="font-bold opacity-90">{format(parseISO(startISO), 'HH:mm')} · {ownerLabel(ev)}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{ev.title}</span>
                </button>
              )
            })}
            {drag && drag.dayIndex === dayIndex && (
              <div
                className="pointer-events-none absolute right-0.5 left-0.5 z-[6] rounded-sm px-1.5 py-0.5 text-[0.72rem] leading-tight text-white opacity-80 shadow-lg ring-2 ring-white/70"
                style={{
                  top: (drag.startMin / 60) * hourHeight,
                  height: (drag.durationMin / 60) * hourHeight - 2,
                  background: dragRef.current?.color,
                }}
              >
                <span className="font-bold">{minutesToLabel(drag.startMin)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// "HH:mm" for a minute offset within a day — used on the drag ghost.
function minutesToLabel(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
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
