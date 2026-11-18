import { parseDuration, uploadsPlaylistId, type CatchupVideo } from './catchup'
import { readSLaneCache, writeSLaneCache, type StoredChannel } from './catchupStore'

const BASE = 'https://www.googleapis.com/youtube/v3'
const POOL_SIZE = 6

export class CatchupApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message)
    this.name = 'CatchupApiError'
  }
}

/** One GET against the Data API. With a token it signs in as the owner, otherwise it uses the API key. */
async function call(path: string, params: Record<string, string>, accessToken?: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const qs = new URLSearchParams(params)
  const init: RequestInit = {}
  if (accessToken) {
    init.headers = { Authorization: `Bearer ${accessToken}` }
  } else {
    const key = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined
    if (!key) throw new CatchupApiError('VITE_YOUTUBE_API_KEY is not set', 0, 'noKey')
    qs.set('key', key)
  }
  const res = await fetch(`${BASE}/${path}?${qs}`, init)
  if (!res.ok) {
    let reason: string | undefined
    try {
      reason = (await res.json())?.error?.errors?.[0]?.reason
    } catch {
      /* no JSON body */
    }
    throw new CatchupApiError(`YouTube API ${path}: ${res.status}${reason ? ` (${reason})` : ''}`, res.status, reason)
  }
  return res.json()
}

/** Every channel the signed-in owner subscribes to, all pages. 1 quota unit per 50. */
export async function listSubscriptions(accessToken: string): Promise<StoredChannel[]> {
  const out: StoredChannel[] = []
  let pageToken: string | undefined
  do {
    const params: Record<string, string> = { part: 'snippet', mine: 'true', maxResults: '50' }
    if (pageToken) params.pageToken = pageToken
    const data = await call('subscriptions', params, accessToken)
    for (const it of data.items ?? []) {
      out.push({ id: it.snippet.resourceId.channelId, title: it.snippet.title })
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/** Titles, thumbnails and length for video ids; only videos that can play in the embed. 1 quota unit per 50. */
export async function describeVideos(ids: string[]): Promise<CatchupVideo[]> {
  const found = new Map<string, CatchupVideo>()
  for (let i = 0; i < ids.length; i += 50) {
    const data = await call('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(',') })
    for (const it of data.items ?? []) {
      const durationSec = parseDuration(it.contentDetails?.duration ?? '')
      // Not embeddable, or live/upcoming (no length yet): it cannot be played from the queue.
      if (it.status?.embeddable === false || durationSec === 0) continue
      found.set(it.id, {
        id: it.id,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        publishedAt: it.snippet.publishedAt,
        durationSec,
        thumbnail: it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? '',
      })
    }
  }
  // Keep the caller's order; private, removed and unplayable videos simply have no entry.
  return ids.flatMap((id) => (found.has(id) ? [found.get(id)!] : []))
}

/** Run `fn` over `items` with at most `size` calls in flight, keeping result order. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

/**
 * The newest uploads of every subscribed channel, newest first. Cached for 30 minutes.
 * A channel that fails (removed, no uploads playlist) is skipped; running out of quota throws.
 */
export async function fetchSubscriptionLane(
  channels: StoredChannel[],
  opts: { perChannel?: number; cap?: number } = {},
): Promise<CatchupVideo[]> {
  const cached = readSLaneCache()
  if (cached) return cached
  const perChannel = opts.perChannel ?? 5
  const cap = opts.cap ?? 100

  const perList = await pool(channels, POOL_SIZE, async (c) => {
    const list = uploadsPlaylistId(c.id)
    if (!list) return [] as string[]
    try {
      const data = await call('playlistItems', { part: 'contentDetails', playlistId: list, maxResults: String(perChannel) })
      return (data.items ?? []).map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId) as string[]
    } catch (err) {
      if (err instanceof CatchupApiError && err.status === 403 && err.reason === 'quotaExceeded') throw err
      return []
    }
  })

  const ids = [...new Set(perList.flat())]
  const videos = (await describeVideos(ids))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, cap)
  writeSLaneCache(videos)
  return videos
}
