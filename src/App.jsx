import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib/supabaseClient'
import Login from './components/Login'
import CalendarView from './components/CalendarView'
import SetupNotice from './components/SetupNotice'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupNotice />

  if (loading) {
    return (
      <div className="centered-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) return <Login />

  return <CalendarView session={session} />
}
