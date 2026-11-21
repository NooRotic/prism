/**
 * Which subscribed YouTube channels are streaming right now. No sign-in: the saved subscriptions plus the public API key.
 * Cost per check: 1 unit per subscription (its newest uploads), 1 per 50 videos, 1 per 50 live channels for avatars.
 * A live broadcast appears in its channel's uploads playlist while it runs, which is what makes this cheap; the
 * alternative (search.list eventType=live) is 100 units per channel. Never throws.
 */
import { uploadsPlaylistId } from './catchup'
import { call, CatchupApiError, pool } from './catchupApi'
import type { StoredChannel } from './catchupStore'

const POOL_SIZE = 6
/** A live stream is the channel's newest upload; a few more cover a premiere or a short posted just before. */
const UPLOADS_PER_CHANNEL = 3

export interface LiveStream {
  channelId: string
  channelTitle: string
  videoId: string
  title: string
  /** Null when the streamer hides the count. */
  viewerCount: number | null
  startedAt: string | null
  /** Empty when the avatar lookup failed; the card falls back to an initial. */
  avatarUrl: string
}

export type LiveCheckResult = { status: 'ok'; streams: LiveStream[] } | { status: 'quota' } | { status: 'error' }

const isQuota = (err: unknown) => err instanceof CatchupApiError && err.status === 403 && err.reason === 'quotaExceeded'

export async function fetchLiveSubscriptions(channels: StoredChannel[]): Promise<LiveCheckResult> {
  try {
    const titles = new Map(channels.map((c) => [c.id, c.title]))
    let quotaOut = false
    const readable = channels.filter((c) => uploadsPlaylistId(c.id))

    const perList = await pool(readable, POOL_SIZE, async (c): Promise<{ ids: string[]; failed: boolean }> => {
      if (quotaOut) return { ids: [], failed: false }
      try {
        const data = await call('playlistItems', {
          part: 'contentDetails',
          playlistId: uploadsPlaylistId(c.id)!,
          maxResults: String(UPLOADS_PER_CHANNEL),
        })
        return { ids: (data.items ?? []).map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId), failed: false }
      } catch (err) {
        if (isQuota(err)) quotaOut = true
        // A channel that is gone is not a failure; anything else counts toward "every channel failed".
        return { ids: [], failed: !(err instanceof CatchupApiError && err.status === 404) }
      }
    })
    if (quotaOut) return { status: 'quota' }
    if (readable.length > 0 && perList.every((r) => r.failed)) return { status: 'error' }

    const ids = [...new Set(perList.flatMap((r) => r.ids))]
    const live: Array<{ id: string; snippet: any; liveStreamingDetails?: any }> = [] // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < ids.length; i += 50) {
      const data = await call('videos', { part: 'snippet,liveStreamingDetails,status', id: ids.slice(i, i + 50).join(',') })
      for (const it of data.items ?? []) {
        if (it.snippet?.liveBroadcastContent === 'live' && it.status?.embeddable !== false) live.push(it)
      }
    }

    // One live stream per channel: the first found (the channel's newest).
    const seen = new Set<string>()
    const unique = live.filter((v) => !seen.has(v.snippet.channelId) && seen.add(v.snippet.channelId))

    const avatars = new Map<string, string>()
    const channelIds = unique.map((v) => v.snippet.channelId as string)
    for (let i = 0; i < channelIds.length; i += 50) {
      try {
        const data = await call('channels', { part: 'snippet', id: channelIds.slice(i, i + 50).join(',') })
        for (const it of data.items ?? []) {
          avatars.set(it.id, it.snippet?.thumbnails?.default?.url ?? it.snippet?.thumbnails?.medium?.url ?? '')
        }
      } catch (err) {
        if (isQuota(err)) break
        /* avatars are decoration: carry on without them */
      }
    }

    return {
      status: 'ok',
      streams: unique.map((v) => {
        const viewers = v.liveStreamingDetails?.concurrentViewers
        return {
          channelId: v.snippet.channelId,
          channelTitle: titles.get(v.snippet.channelId) ?? v.snippet.channelTitle ?? '',
          videoId: v.id,
          title: v.snippet.title,
          viewerCount: viewers === undefined ? null : Number(viewers),
          startedAt: v.liveStreamingDetails?.actualStartTime ?? null,
          avatarUrl: avatars.get(v.snippet.channelId) ?? '',
        }
      }),
    }
  } catch (err) {
    return isQuota(err) ? { status: 'quota' } : { status: 'error' }
  }
}
