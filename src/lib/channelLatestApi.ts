/**
 * "Latest video from <youtuber>": a channel's newest uploads. Cheap on purpose.
 * Quota: a handle lookup (channels.list forHandle) 1 + the uploads playlist 1 = 2 units; each further page of 50 is 1 unit. A name that is not a
 * handle falls back to one channel search (100) + channels.list by id (1) + the playlist (1). The channel is
 * cached 24 h, the uploads 10 min. Never throws.
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import { ttlGet, ttlSet } from './ttlCache'
import { youtubeGet } from './videoPageApi'
import { isQuotaReached } from './youtubeQuota'
import type { YouTubeVideo } from './youtubeApi'

const prefix = STORAGE_KEYS.LOCAL_VIDEO_PAGE_CACHE_PREFIX
const DAY_MS = 24 * 60 * 60 * 1000
const UPLOADS_TTL_MS = 10 * 60 * 1000
const PAGE = 50

export type LatestResult =
  | {
      status: 'ok'
      channelTitle: string
      videos: YouTubeVideo[]
      /** The channel's public video count, or null when it does not say. */
      total: number | null
      /** The uploads playlist, for `moreFromChannel`. */
      playlistId: string
      /** The token for the next page, or null on the last page. */
      nextPageToken: string | null
    }
  | { status: 'notfound' }
  | { status: 'error' }

export type MoreResult = { status: 'ok'; videos: YouTubeVideo[]; nextPageToken: string | null } | { status: 'error' }

interface Channel {
  title: string
  uploads: string
  total?: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
const toChannel = (it: any): Channel | null =>
  it?.contentDetails?.relatedPlaylists?.uploads ? {
        title: it.snippet?.title ?? '',
        uploads: it.contentDetails.relatedPlaylists.uploads,
        total: Number.isFinite(Number(it.statistics?.videoCount)) && it.statistics?.videoCount !== undefined ? Number(it.statistics.videoCount) : null,
      }
    : null

async function byHandle(name: string): Promise<Channel | null> {
  const handle = name.replace(/\s+/g, '').replace(/^@/, '')
  if (!handle) return null
  try {
    const data = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', forHandle: `@${handle}` })
    return toChannel(data.items?.[0])
  } catch (err) {
    if (isQuotaReached()) throw err
    return null // not a valid handle: the search below decides
  }
}

async function bySearch(name: string): Promise<Channel | null> {
  const found = await youtubeGet('search', { part: 'snippet', type: 'channel', q: name, maxResults: '1' })
  const id: string | undefined = found.items?.[0]?.id?.channelId
  if (!id) return null
  const data = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', id })
  return toChannel(data.items?.[0])
}

async function resolveChannel(name: string, key: string): Promise<Channel | null> {
  const cacheKey = `${prefix}channel_${key}`
  const cached = ttlGet<Channel>(cacheKey, DAY_MS)
  if (cached) return cached
  const channel = (await byHandle(name)) ?? (await bySearch(name))
  if (channel) ttlSet(cacheKey, channel)
  return channel
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
function toVideos(items: any[], fallbackChannel: string): YouTubeVideo[] {
  return items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
    .filter((e: any) => e.status?.privacyStatus !== 'private' && e.snippet?.title !== 'Deleted video' && e.snippet?.title !== 'Private video')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
    .map((e: any) => ({
      id: e.snippet.resourceId.videoId,
      title: e.snippet.title,
      channelTitle: e.snippet.videoOwnerChannelTitle ?? fallbackChannel,
      thumbnail: e.snippet.thumbnails?.medium?.url ?? e.snippet.thumbnails?.default?.url ?? '',
      publishedAt: e.snippet.publishedAt ?? '',
      description: e.snippet.description ?? '',
    }))
}

export async function latestFromChannel(name: string): Promise<LatestResult> {
  const key = name.trim().toLowerCase()
  const cacheKey = `${prefix}latest_${key}`
  const cached = ttlGet<LatestResult>(cacheKey, UPLOADS_TTL_MS)
  if (cached && cached.status === 'ok' && cached.playlistId) return cached
  try {
    const channel = await resolveChannel(name.trim(), key)
    if (!channel) return { status: 'notfound' }
    const data = await youtubeGet('playlistItems', { part: 'snippet,status', playlistId: channel.uploads, maxResults: String(PAGE) })
    const result: LatestResult = {
      status: 'ok',
      channelTitle: channel.title,
      videos: toVideos(data.items ?? [], channel.title),
      total: channel.total ?? null,
      playlistId: channel.uploads,
      nextPageToken: data.nextPageToken ?? null,
    }
    ttlSet(cacheKey, result)
    return result
  } catch {
    return { status: 'error' }
  }
}

/** The next page (50) of a channel's uploads, 1 unit, cached 10 min per page. Never throws. */
export async function moreFromChannel(playlistId: string, pageToken: string): Promise<MoreResult> {
  const cacheKey = `${prefix}more_${playlistId}_${pageToken}`
  const cached = ttlGet<MoreResult>(cacheKey, UPLOADS_TTL_MS)
  if (cached) return cached
  try {
    const data = await youtubeGet('playlistItems', { part: 'snippet,status', playlistId, maxResults: String(PAGE), pageToken })
    const result: MoreResult = { status: 'ok', videos: toVideos(data.items ?? [], ''), nextPageToken: data.nextPageToken ?? null }
    ttlSet(cacheKey, result)
    return result
  } catch {
    return { status: 'error' }
  }
}
