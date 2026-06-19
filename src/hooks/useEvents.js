import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Fetches all events that overlap [rangeStart, rangeEnd) and keeps them
// live via Supabase realtime so both partners see changes instantly.
export function useEvents(rangeStart, rangeEnd) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const startISO = rangeStart.toISOString()
  const endISO = rangeEnd.toISOString()

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    // An event is visible in the window if it starts before the window ends
    // and ends after the window starts.
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .lt('start_at', endISO)
      .gt('end_at', startISO)
      .order('start_at', { ascending: true })
    if (error) setError(error.message)
    else setEvents(data ?? [])
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
