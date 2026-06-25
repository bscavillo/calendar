import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
} from 'date-fns'

// A recurring event is stored as a single "master" row carrying its first
// occurrence's times plus how it repeats. Concrete occurrences are generated
// on the fly for whatever window is on screen, so a weekly event spanning years
// never needs more than one database row.

const STEPPERS = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
}

const FREQ_LABEL = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
  yearly: 'Repeats yearly',
}

export const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

// Human label for the view screen, e.g. "Repeats weekly".
export function recurrenceLabel(ev) {
  return FREQ_LABEL[ev.recurrence_freq] || null
}

// Skip whole periods so iteration starts just before the visible window instead
// of walking from the (possibly years-old) first occurrence. Subtracting one
// period guarantees we never overshoot a valid occurrence.
function initialSkip(freq, start, windowStart) {
  if (windowStart <= start) return 0
  let skip = 0
  if (freq === 'daily') skip = differenceInCalendarDays(windowStart, start)
  else if (freq === 'weekly') skip = Math.floor(differenceInCalendarDays(windowStart, start) / 7)
  else if (freq === 'monthly') skip = differenceInCalendarMonths(windowStart, start)
  else if (freq === 'yearly') skip = differenceInCalendarYears(windowStart, start)
  return Math.max(0, skip - 1)
}

// A generous safety cap so a malformed series can never loop forever; far more
// than the number of occurrences any sane window (≤6 weeks) can hold.
const MAX_OCCURRENCES = 750

// Replace each recurring master row with the concrete occurrences that fall in
// [rangeStart, rangeEnd); pass non-recurring rows straight through. Each
// occurrence keeps the master's id (so edit/delete act on the whole series) but
// gets its own `instanceKey` for React lists and the original master times under
// `series_start_at`/`series_end_at` so editing can prefill the series anchor.
//
// A single occurrence can be moved (e.g. dragged in the week view) without
// disturbing the rest of the series: the master's `overrides` map, keyed by the
// occurrence's original start instant (`occurrenceKey`), supplies replacement
// `start_at`/`end_at` for just that one occurrence.
export function expandEvents(rows, rangeStart, rangeEnd) {
  const winStart = rangeStart.getTime()
  const winEnd = rangeEnd.getTime()
  const out = []

  for (const ev of rows) {
    const stepper = STEPPERS[ev.recurrence_freq]
    if (!stepper) {
      out.push(ev)
      continue
    }

    const overrides = ev.overrides || {}
    const start = new Date(ev.start_at)
    const duration = new Date(ev.end_at).getTime() - start.getTime()
    const until = ev.recurrence_until
      ? new Date(`${String(ev.recurrence_until).slice(0, 10)}T23:59:59.999Z`).getTime()
      : Infinity

    // Regular occurrences at their scheduled times. A moved occurrence is
    // skipped here and re-emitted at its overridden time below, so it shows up
    // in whatever window it now lands in.
    let n = initialSkip(ev.recurrence_freq, start, rangeStart)
    for (let count = 0; count < MAX_OCCURRENCES; count++, n++) {
      const occStart = stepper(start, n)
      const occStartMs = occStart.getTime()
      if (occStartMs > winEnd || occStartMs > until) break
      const key = occStart.toISOString()
      if (overrides[key]) continue // moved — handled in the overrides pass
      const occEndMs = occStartMs + duration
      if (occEndMs <= winStart) continue // entirely before the window
      out.push(makeOccurrence(ev, key, key, new Date(occEndMs).toISOString()))
    }

    // Moved occurrences: place each at its new time if it touches the window.
    for (const [key, ov] of Object.entries(overrides)) {
      const ovStartMs = new Date(ov.start_at).getTime()
      const ovEndMs = new Date(ov.end_at).getTime()
      if (ovStartMs >= winEnd || ovEndMs <= winStart) continue
      out.push(makeOccurrence(ev, key, ov.start_at, ov.end_at))
    }
  }

  return out
}

// Build one concrete occurrence of a recurring series. `occurrenceKey` is the
// occurrence's original start instant — stable across moves — so a drag always
// targets the same override entry no matter where the occurrence has been moved.
function makeOccurrence(ev, occurrenceKey, startISO, endISO) {
  return {
    ...ev,
    start_at: startISO,
    end_at: endISO,
    series_start_at: ev.start_at,
    series_end_at: ev.end_at,
    occurrenceKey,
    instanceKey: `${ev.id}#${occurrenceKey}`,
    is_recurring_instance: true,
  }
}
