import { useEffect, useState } from 'react'
import { fetchTrackerSummary, type TrackerSummary } from '../lib/twitchTracker'

interface Loaded {
  login: string
  summary: TrackerSummary | null
}

/**
 * TwitchTracker's summary for a login. Pass null to make no request. `loading` is true from the
 * moment a login is given until its answer arrives; a failure ends loading with a null summary,
 * because the page shows "no data" for both.
 */
export function useTrackerSummary(login: string | null): { summary: TrackerSummary | null; loading: boolean } {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!login) return
    let cancelled = false
    fetchTrackerSummary(login)
      .then((summary) => {
        if (!cancelled) setLoaded({ login, summary })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ login, summary: null })
      })
    return () => {
      cancelled = true
    }
  }, [login])

  if (!login) return { summary: null, loading: false }
  if (loaded?.login !== login) return { summary: null, loading: true }
  return { summary: loaded.summary, loading: false }
}
