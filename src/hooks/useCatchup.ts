import { useCallback, useEffect, useRef, useState } from 'react'
import { blend, parseVideoIds, type CatchupVideo } from '../lib/catchup'
import { CatchupApiError, describeVideos, fetchSubscriptionLane, listSubscriptions } from '../lib/catchupApi'
import {
  getSubscriptions,
  getWatchedSeeds,
  getWatchLater,
  setSubscriptions,
  setWatchLater,
} from '../lib/catchupStore'
import { GoogleAuthError, requestYoutubeReadToken } from '../lib/googleYoutubeAuth'
import { fetchRelatedLane } from '../lib/mixRelated'

export interface CatchupState {
  queue: CatchupVideo[]
  status: 'idle' | 'loading' | 'ready'
  /** Plain-language reasons a lane is missing or a button did nothing. */
  notices: string[]
  subscriptionCount: number
  watchLaterCount: number
  importSubscriptions(): Promise<void>
  savePastedWatchLater(text: string): Promise<void>
  refresh(): Promise<void>
}

const isQuota = (e: unknown) => e instanceof CatchupApiError && e.status === 403 && e.reason === 'quotaExceeded'

/** Loads the three lanes (subscriptions, Watch Later, related) and blends them 2 : 1 : 1. */
export function useCatchup(): CatchupState {
  const [queue, setQueue] = useState<CatchupVideo[]>([])
  const [status, setStatus] = useState<CatchupState['status']>('idle')
  const [laneNotices, setLaneNotices] = useState<string[]>([])
  const [actionNotices, setActionNotices] = useState<string[]>([])
  const [counts, setCounts] = useState(() => ({ subs: getSubscriptions().length, later: getWatchLater().length }))
  // A newer refresh wins: an older one finishing late must not overwrite it.
  const run = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++run.current
    const subs = getSubscriptions()
    const later = getWatchLater()
    const seeds = getWatchedSeeds()
    setCounts({ subs: subs.length, later: later.length })
    setStatus('loading')

    const [s, w, r] = await Promise.allSettled([
      subs.length ? fetchSubscriptionLane(subs) : Promise.resolve<CatchupVideo[]>([]),
      later.length ? describeVideos(later) : Promise.resolve<CatchupVideo[]>([]),
      seeds.length ? fetchRelatedLane(seeds) : Promise.resolve<CatchupVideo[]>([]),
    ])
    if (mine !== run.current) return

    const notices: string[] = []
    if (s.status === 'rejected') {
      notices.push(
        isQuota(s.reason)
          ? "Subscriptions: YouTube's daily quota is used up. Try again tomorrow."
          : 'Subscriptions: could not load the latest uploads.',
      )
    }
    if (w.status === 'rejected') notices.push('Watch Later: could not load your pasted videos.')
    if (r.status === 'rejected' || (r.status === 'fulfilled' && seeds.length > 0 && r.value.length === 0)) {
      notices.push('Related: no suggestions came back for your recent videos.')
    }

    setQueue(blend(s.status === 'fulfilled' ? s.value : [], w.status === 'fulfilled' ? w.value : [], r.status === 'fulfilled' ? r.value : []))
    setLaneNotices(notices)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importSubscriptions = useCallback(async () => {
    setActionNotices([])
    try {
      const token = await requestYoutubeReadToken()
      setSubscriptions(await listSubscriptions(token))
    } catch (err) {
      setActionNotices([
        err instanceof GoogleAuthError
          ? err.reason === 'closed'
            ? 'The Google sign-in window was closed, so nothing was imported.'
            : err.reason === 'denied'
              ? 'Google did not allow the sign-in, so nothing was imported.'
              : err.reason === 'unconfigured'
                ? 'Google sign-in is not set up for this build.'
                : 'Could not reach Google sign-in.'
          : 'Could not read your subscriptions from YouTube.',
      ])
      return
    }
    await refresh()
  }, [refresh])

  const savePastedWatchLater = useCallback(
    async (text: string) => {
      setWatchLater(parseVideoIds(text))
      await refresh()
    },
    [refresh],
  )

  return {
    queue,
    status,
    notices: [...actionNotices, ...laneNotices],
    subscriptionCount: counts.subs,
    watchLaterCount: counts.later,
    importSubscriptions,
    savePastedWatchLater,
    refresh,
  }
}
