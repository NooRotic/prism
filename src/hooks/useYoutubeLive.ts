import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../config/storageKeys'
import { getSubscriptions } from '../lib/catchupStore'
import { isYouTubeApiAvailable } from '../lib/youtubeApi'
import { fetchLiveSubscriptions } from '../lib/youtubeLive'
import { checkAllowed, recordCheck, type CheckAllowance } from '../lib/youtubeLiveBudget'
import { readLiveLast, subscribeLiveLast, writeLiveLast, type LiveLast } from '../lib/youtubeLiveStore'
import { isQuotaReached } from '../lib/youtubeQuota'
import { useYoutubeAccount } from './useYoutubeAccount'
import { useYoutubeQuotaReached } from './useYoutubeQuota'

export type LiveStatus = 'idle' | 'checking' | 'ok' | 'quota' | 'error'

let autoDoneFallback = false

/** Whether this tab's visit already had its automatic check. Per tab and kept over a reload (sessionStorage). */
function autoCheckDone(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.SESSION_YOUTUBE_LIVE_AUTO) !== null
  } catch {
    return autoDoneFallback
  }
}

function markAutoCheckDone(): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_YOUTUBE_LIVE_AUTO, '1')
  } catch {
    autoDoneFallback = true // storage unavailable: the module flag holds it for this page
  }
}

/**
 * The rail's YouTube "Check live". The first check of a visit (a tab; a reload is the same visit) runs on its own, within
 * the same allowance as a click; every later one is the button. Nothing runs on a timer. A check costs about one unit per
 * subscription, so it is limited per browser (see youtubeLiveBudget); the last answer is kept with its age, and the
 * player page adds or drops a stream it sees (youtubeLiveStore), which this follows.
 */
export function useYoutubeLive() {
  const { subscriptionCount } = useYoutubeAccount()
  const quotaReached = useYoutubeQuotaReached()
  const available = isYouTubeApiAvailable() && subscriptionCount > 0

  const [last, setLast] = useState<LiveLast | null>(readLiveLast)
  const [status, setStatus] = useState<LiveStatus>(() => (readLiveLast()?.checkedAt != null ? 'ok' : 'idle'))
  const [now, setNow] = useState(() => Date.now())
  const running = useRef(false)

  // The age label and the cooldown count down; once a minute is enough.
  useEffect(() => {
    if (!available) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [available])

  const check = useCallback(async () => {
    if (running.current || !isYouTubeApiAvailable()) return
    if (!checkAllowed().ok || isQuotaReached()) return
    running.current = true
    recordCheck()
    setStatus('checking')
    try {
      const result = await fetchLiveSubscriptions(getSubscriptions())
      if (result.status === 'ok') {
        writeLiveLast({ checkedAt: Date.now(), streams: result.streams })
        setStatus('ok')
      } else {
        setStatus(result.status)
      }
    } finally {
      running.current = false
      setNow(Date.now())
    }
  }, [])

  // The store is shared with the player page and other tabs.
  useEffect(() => subscribeLiveLast(() => setLast(readLiveLast())), [])

  // The first check of this visit runs on its own, once subscriptions are known.
  useEffect(() => {
    if (!available || autoCheckDone()) return
    markAutoCheckDone()
    void check()
  }, [available, check])

  const allowance: CheckAllowance = checkAllowed(now)
  return {
    available,
    streams: last?.streams ?? [],
    checkedAt: last?.checkedAt ?? null,
    status,
    allowance,
    quotaReached,
    now,
    check,
  }
}
