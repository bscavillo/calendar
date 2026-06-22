// An event's color is derived from whose it is — it is not user-pickable.
// Shared events are pink; your own events are blue; the partner's are purple.
// These mirror the `shared` / `mine` / `partner` palette tokens in index.css.
const SHARED = '#e7a8cd' // pastel pink
const MINE = '#9fbef0' // pastel blue
const PARTNER = '#a99ce6' // pastel purple

export function eventColor(ev, userId) {
  if (ev.is_shared) return SHARED
  return ev.owner_id === userId ? MINE : PARTNER
}
