import { useEffect, useRef } from 'react'

// Fires a browser notification `remind_minutes` before an event starts.
// NOTE: this only works while the app tab is open. True push notifications
// when the app is closed require a backend cron / push service.
export function useReminders(events) {
  const firedRef = useRef(new Set())

  useEffect(() => {
    if (!('Notification' in window)) return

    const interval = setInterval(() => {
      if (Notification.permission !== 'granted') return
      const now = Date.now()

      for (const ev of events) {
        if (ev.remind_minutes == null) continue
        const remindAt = new Date(ev.start_at).getTime() - ev.remind_minutes * 60_000
        const key = `${ev.id}:${ev.start_at}`
        // Fire once, within a 60s window after the reminder time passes.
        if (!firedRef.current.has(key) && now >= remindAt && now < remindAt + 60_000) {
          firedRef.current.add(key)
          const when = new Date(ev.start_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          new Notification('💜 Upcoming: ' + ev.title, {
            body: `Starts at ${when}${ev.location ? ' · ' + ev.location : ''}`,
          })
        }
      }
    }, 20_000)

    return () => clearInterval(interval)
  }, [events])
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}
