import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surfaced clearly in the UI via App.jsx rather than crashing silently.
  console.warn(
    'Missing Supabase credentials. Copy .env.example to .env and fill in your project values.'
  )
}

export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey)
  : null
