import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../config/storageKeys'
import { getSubscriptions } from '../lib/catchupStore'
import { isYouTubeApiAvailable } from '../lib/youtubeApi'
import { fetchLiveSubscriptions, type LiveStream } from '../lib/youtubeLive'
import { checkAllowed, recordCheck, type CheckAllowance } from '../lib/youtubeLiveBudget'
import { isQuotaReached } from '../lib/youtubeQuota'
import { useYoutubeAccount } from './useYoutubeAccount'
import { useYoutubeQuotaReached } from './useYoutubeQuota'

export type LiveStatus = 'idle' | 'checking' | 'ok' | 'quota' | 'error'

interface Last {
  checkedAt: number
  streams: LiveStream[]
}

function readLast(): Last | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST) ?? 'null')
    if (v && typeof v.checkedAt === 'number' && Array.isArray(v.streams)) return v as Last
  } catch {
    /* damaged: no last answer */
  }
  return null
}

function writeLast(last: Last): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST, JSON.stringify(last))
  } catch {
    /* storage unavailable: the answer just is not remembered */
  }
}

/**
 * The rail's YouTube "Check live". Strictly viewer-initiated: nothing runs on mount or on a timer. A check costs about one
 * unit per subscription, so it is limited per browser (see youtubeLiveBudget); the last answer is kept with its age.
 */
export function useYoutubeLive() {
  const { subscriptionCount } = useYoutubeAccount()
  const quotaReached = useYoutubeQuotaReached()
  const available = isYouTubeApiAvailable() && subscriptionCount > 0

  const [last, setLast] = useState<Last | null>(readLast)
  const [status, setStatus] = useState<LiveStatus>(() => (readLast() ? 'ok' : 'idle'))
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
        const next = { checkedAt: Date.now(), streams: result.streams }
        writeLast(next)
        setLast(next)
        setStatus('ok')
      } else {
        setStatus(result.status)
      }
    } finally {
      running.current = false
      setNow(Date.now())
    }
  }, [])

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
