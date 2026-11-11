import { useEffect, useState } from 'react'
import { fetchTrackerSummary, trackerUnavailable, type TrackerSummary } from '../lib/twitchTracker'

interface Loaded {
  login: string
  summary: TrackerSummary | null
  unavailable: boolean
}

interface TrackerState {
  summary: TrackerSummary | null
  loading: boolean
  /** True when there is no summary because no answer could be had, as opposed to TwitchTracker not tracking the channel. */
  unavailable: boolean
}

/**
 * TwitchTracker's summary for a login. Pass null to make no request. `loading` is true from the
 * moment a login is given until its answer arrives. With no summary, `unavailable` tells "no
 * answer" (blocked, failing, rate limited, switched off) from "TwitchTracker answered and does not
 * track this channel": the figures show a dash either way, but only the second says anything
 * about the channel.
 */
export function useTrackerSummary(login: string | null): TrackerState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!login) return
    let cancelled = false
    fetchTrackerSummary(login)
      .then((summary) => {
        if (!cancelled) setLoaded({ login, summary, unavailable: summary === null && trackerUnavailable(login) })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ login, summary: null, unavailable: true })
      })
    return () => {
      cancelled = true
    }
  }, [login])

  if (!login) return { summary: null, loading: false, unavailable: false }
  if (loaded?.login !== login) return { summary: null, loading: true, unavailable: false }
  return { summary: loaded.summary, loading: false, unavailable: loaded.unavailable }
}
