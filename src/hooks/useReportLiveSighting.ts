import { useEffect } from 'react'
import { getSubscriptions } from '../lib/catchupStore'
import type { VideoPageData } from '../lib/videoPageApi'
import { applySighting, readLiveLast, writeLiveLast } from '../lib/youtubeLiveStore'

/**
 * Tells the rail what the player page learned for free: a live video of a subscribed channel joins its list, an ended
 * one leaves it. An upcoming video says nothing either way. Spends no quota and no check.
 */
export function useReportLiveSighting(data: VideoPageData | null): void {
  useEffect(() => {
    if (!data || data.live.state === 'upcoming') return
    const next = applySighting(
      readLiveLast(),
      {
        videoId: data.id,
        channelId: data.channelId,
        channelTitle: data.channelTitle,
        title: data.title,
        isLive: data.live.state === 'live',
        viewerCount: data.live.viewerCount,
        startedAt: data.live.startedAt,
      },
      getSubscriptions(),
    )
    if (next) writeLiveLast(next)
  }, [data])
}
