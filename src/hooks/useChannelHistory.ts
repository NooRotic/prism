import { useEffect, useState } from 'react'
import { SEND_VISITS } from '../config/historyServer'
import { loadChannelHistory, type ChannelHistory, type HistoryResult } from '../lib/historyApi'

export type ChannelHistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ChannelHistory }
  | { status: 'untracked' }
  | { status: 'unavailable' }

interface Loaded {
  login: string
  result: HistoryResult
}

/** A channel is reported to the history server at most this often per browser tab. */
const VISIT_INTERVAL_MS = 30 * 60 * 1000

// When each channel was last reported in this tab. A layout flip remounts the channel body, and a viewer can
// move between pages, so without this a visit would be sent on every mount.
const lastVisit = new Map<string, number>()

/** Forgets which channels this tab has reported. For tests. */
export function resetVisitMemory(): void {
  lastVisit.clear()
}

/**
 * The history server's record of a channel, for a channel page. Pass undefined to make no request. On the
 * first load of a channel in a production build this also reports the visit (which starts tracking the
 * channel); within 30 minutes of that it only reads. The page never waits on the server: while it loads, and
 * when it is down, slow or does not track the channel, the state says so and the page shows nothing extra.
 */
export function useChannelHistory(login: string | undefined): ChannelHistoryState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!login) return
    const key = login.toLowerCase()
    const controller = new AbortController()
    let cancelled = false

    const now = Date.now()
    const last = lastVisit.get(key)
    const sendVisit = SEND_VISITS && (last === undefined || now - last >= VISIT_INTERVAL_MS)
    if (sendVisit) lastVisit.set(key, now)

    loadChannelHistory(key, { sendVisit, signal: controller.signal }).then((result) => {
      if (!cancelled) setLoaded({ login: key, result })
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [login])

  if (!login) return { status: 'idle' }
  if (loaded?.login !== login.toLowerCase()) return { status: 'loading' }
  switch (loaded.result.kind) {
    case 'tracked':
      return { status: 'ready', data: loaded.result.data }
    case 'untracked':
      return { status: 'untracked' }
    default:
      return { status: 'unavailable' }
  }
}
