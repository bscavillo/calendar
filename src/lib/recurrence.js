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

    const start = new Date(ev.start_at)
    const duration = new Date(ev.end_at).getTime() - start.getTime()
    const until = ev.recurrence_until
      ? new Date(`${String(ev.recurrence_until).slice(0, 10)}T23:59:59.999Z`).getTime()
      : Infinity

    let n = initialSkip(ev.recurrence_freq, start, rangeStart)
    for (let count = 0; count < MAX_OCCURRENCES; count++, n++) {
      const occStart = stepper(start, n)
      const occStartMs = occStart.getTime()
      if (occStartMs > winEnd || occStartMs > until) break
      const occEndMs = occStartMs + duration
      if (occEndMs <= winStart) continue // entirely before the window
      out.push({
        ...ev,
        start_at: occStart.toISOString(),
        end_at: new Date(occEndMs).toISOString(),
        series_start_at: ev.start_at,
        series_end_at: ev.end_at,
        instanceKey: `${ev.id}#${occStartMs}`,
        is_recurring_instance: true,
      })
    }
  }

  return out
}
