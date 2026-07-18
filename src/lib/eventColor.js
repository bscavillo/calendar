// An event's color is derived from whose it is — and it is NOT viewer-relative,
// so both people see the same person in the same color. Shared events are pink;
// the primary user (the first of you to sign up) is blue; the other user is
// purple. These mirror the `shared` / `primary` / `secondary` palette tokens in
// index.css.
const SHARED = '#e7a8cd' // pastel pink
const PRIMARY = '#9fbef0' // pastel blue
const SECONDARY = '#a99ce6' // pastel purple

// `primaryUserId` is the user who is always shown in blue (see primaryUserId in
// useProfiles) — the same for everyone, regardless of who is logged in.
export function eventColor(ev, primaryUserId) {
  if (ev.is_shared) return SHARED
  return ev.owner_id === primaryUserId ? PRIMARY : SECONDARY
}
