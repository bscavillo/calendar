// Time-zone helpers.
//
// Every event is stored as an absolute instant (Postgres `timestamptz`, i.e. a
// UTC point in time). That means alignment across zones is automatic: whoever
// views an event sees it rendered in *their own* local zone. These helpers let
// us also render an instant in a *specific* zone (e.g. the partner's) and label
// times so it's clear which zone a number belongs to.

// The viewer's current IANA zone, e.g. "Europe/Berlin" or "America/New_York".
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Short zone abbreviation for an instant in a zone, e.g. "CEST", "EDT".
export function zoneAbbrev(timeZone, instant = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(instant)
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

// "18:00" — 24-hour time of an instant as seen in a given zone.
export function formatTimeInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant)
}

// "Sat, Jun 20" — the calendar date of an instant as seen in a given zone.
export function formatDateInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(instant)
}

// A human label for a zone, e.g. "Berlin" from "Europe/Berlin".
export function zoneCity(timeZone) {
  if (!timeZone) return ''
  const tail = timeZone.split('/').pop() || timeZone
  return tail.replace(/_/g, ' ')
}
