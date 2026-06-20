import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Loads every profile (there are only two of you) keyed by user id, and keeps
// them live so a name or color change shows up for both partners instantly.
export function useProfiles() {
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, color, timezone')
    if (data) {
      const map = {}
      for (const p of data) map[p.id] = p
      setProfiles(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  useEffect(() => {
    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchProfiles()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProfiles])

  return { profiles, loading, refetch: fetchProfiles }
}
