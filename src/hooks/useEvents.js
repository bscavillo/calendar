import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { expandEvents } from '../lib/recurrence'

// Fetches all events that overlap [rangeStart, rangeEnd) and keeps them
// live via Supabase realtime so both users see changes instantly.
export function useEvents(rangeStart, rangeEnd) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const startISO = rangeStart.toISOString()
  const endISO = rangeEnd.toISOString()

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    // A one-off event is visible if it starts before the window ends and ends
    // after the window starts. A recurring master is relevant if it started
    // before the window ends and its series hasn't already finished — its
    // concrete occurrences are then generated client-side by expandEvents.
    const dayStart = startISO.slice(0, 10)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .or(
        `and(recurrence_freq.is.null,start_at.lt.${endISO},end_at.gt.${startISO}),` +
          `and(recurrence_freq.not.is.null,start_at.lt.${endISO},or(recurrence_until.is.null,recurrence_until.gte.${dayStart}))`
      )
      .order('start_at', { ascending: true })
    if (error) setError(error.message)
    else setEvents(expandEvents(data ?? [], new Date(startISO), new Date(endISO)))
    setLoading(false)
  }, [startISO, endISO])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Realtime: refetch whenever any event row changes.
  useEffect(() => {
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchEvents])

  return { events, loading, error, refetch: fetchEvents }
}
