import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Loads every profile (there are only two of you) keyed by user id, and keeps
// them live so a name change shows up for both partners instantly.
export function useProfiles() {
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, timezone, created_at')
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

  // The "primary" user is shown in blue for everyone; the other user is
  // purple. We pick the account that signed up first (created_at, with the id
  // as a stable tie-break) so the choice is the same for both viewers and
  // needs no configuration. See eventColor().
  const primaryUserId = useMemo(() => {
    const list = Object.values(profiles)
    if (list.length === 0) return null
    list.sort((a, b) => {
      const ta = a.created_at || ''
      const tb = b.created_at || ''
      if (ta !== tb) return ta < tb ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
    return list[0].id
  }, [profiles])

  return { profiles, primaryUserId, loading, refetch: fetchProfiles }
}
