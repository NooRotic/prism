import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blend, parseVideoIds, type CatchupVideo, type Lane } from '../lib/catchup'
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
  /** 'loading' until every lane has finished, though the queue fills in as each lane lands. */
  status: 'idle' | 'loading' | 'ready'
  /** Plain-language reasons a lane is missing or a button did nothing. */
  notices: string[]
  subscriptionCount: number
  watchLaterCount: number
  importSubscriptions(): Promise<void>
  savePastedWatchLater(text: string): Promise<void>
  refresh(): Promise<void>
}

const LANE_NAME: Record<Lane, string> = { S: 'Subscriptions', W: 'Watch Later', R: 'Related' }
const GENERIC: Record<Lane, string> = {
  S: 'Subscriptions: could not load the latest uploads.',
  W: 'Watch Later: could not load your pasted videos.',
  R: 'Related: no suggestions came back for your recent videos.',
}

/** What to tell the owner when a lane failed: the cause when we know it, otherwise a plain per-lane line. */
function failureNotice(lane: Lane, err: unknown): string {
  if (err instanceof CatchupApiError) {
    if (err.reason === 'noKey') return 'YouTube API key is not set for this build, so videos cannot be loaded.'
    if (err.status === 403 && err.reason === 'quotaExceeded') {
      return `${LANE_NAME[lane]}: YouTube's daily quota is used up. Try again tomorrow.`
    }
  }
  return GENERIC[lane]
}

const EMPTY_LANES: Record<Lane, CatchupVideo[]> = { S: [], W: [], R: [] }
const NO_NOTICES: Record<Lane, string | null> = { S: null, W: null, R: null }

/** Loads the three lanes (subscriptions, Watch Later, related) and blends them 2 : 1 : 1. */
export function useCatchup(): CatchupState {
  const [lanes, setLanes] = useState(EMPTY_LANES)
  const [status, setStatus] = useState<CatchupState['status']>('idle')
  const [laneNotices, setLaneNotices] = useState(NO_NOTICES)
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
    setLanes(EMPTY_LANES)
    setLaneNotices(NO_NOTICES)
    setStatus('loading')

    // Each lane publishes as soon as it lands, so a slow Mix never holds back the subscriptions.
    const land = async (lane: Lane, work: Promise<CatchupVideo[]>, emptyNotice?: string) => {
      try {
        const videos = await work
        if (mine !== run.current) return
        setLanes((l) => ({ ...l, [lane]: videos }))
        if (videos.length === 0 && emptyNotice) setLaneNotices((n) => ({ ...n, [lane]: emptyNotice }))
      } catch (err) {
        if (mine !== run.current) return
        setLaneNotices((n) => ({ ...n, [lane]: failureNotice(lane, err) }))
      }
    }

    await Promise.all([
      land('S', subs.length ? fetchSubscriptionLane(subs) : Promise.resolve([])),
      land('W', later.length ? describeVideos(later) : Promise.resolve([])),
      land('R', seeds.length ? fetchRelatedLane(seeds) : Promise.resolve([]), GENERIC.R),
    ])
    if (mine === run.current) setStatus('ready')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const queue = useMemo(() => blend(lanes.S, lanes.W, lanes.R), [lanes])
  const notices = useMemo(
    () => [...new Set([...actionNotices, ...(['S', 'W', 'R'] as Lane[]).flatMap((l) => (laneNotices[l] ? [laneNotices[l]!] : []))])],
    [actionNotices, laneNotices],
  )

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
    notices,
    subscriptionCount: counts.subs,
    watchLaterCount: counts.later,
    importSubscriptions,
    savePastedWatchLater,
    refresh,
  }
}
