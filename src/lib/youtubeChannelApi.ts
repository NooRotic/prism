/**
 * One YouTube channel by handle or id: its title, handle, description and picture. 1 quota unit (channels.list), cached
 * 24 h, and only on a click (the "Link accounts" check). Never throws.
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import { ttlGet, ttlSet } from './ttlCache'
import { youtubeGet } from './videoPageApi'

const prefix = STORAGE_KEYS.LOCAL_VIDEO_PAGE_CACHE_PREFIX
const DAY_MS = 24 * 60 * 60 * 1000

export interface YoutubeChannel {
  channelId: string
  title: string
  /** With the @, as YouTube writes it; empty when the channel has no handle. */
  handle: string
  description: string
  thumbnail: string
}

export type YoutubeChannelResult = { status: 'ok'; channel: YoutubeChannel } | { status: 'notfound' } | { status: 'error' }

export async function fetchYoutubeChannel(ref: { handle: string } | { channelId: string }): Promise<YoutubeChannelResult> {
  const byHandle = 'handle' in ref
  const key = byHandle ? `h_${ref.handle.replace(/^@/, '').toLowerCase()}` : `i_${ref.channelId}`
  const cacheKey = `${prefix}ytchan_${key}`
  const cached = ttlGet<YoutubeChannel>(cacheKey, DAY_MS)
  if (cached) return { status: 'ok', channel: cached }
  try {
    const params: Record<string, string> = { part: 'snippet' }
    if (byHandle) params.forHandle = `@${ref.handle.replace(/^@/, '')}`
    else params.id = ref.channelId
    const data = await youtubeGet('channels', params)
    const it = data.items?.[0]
    if (!it?.id) return { status: 'notfound' }
    const channel: YoutubeChannel = {
      channelId: it.id,
      title: it.snippet?.title ?? '',
      handle: it.snippet?.customUrl ?? '',
      description: it.snippet?.description ?? '',
      thumbnail: it.snippet?.thumbnails?.default?.url ?? it.snippet?.thumbnails?.medium?.url ?? '',
    }
    ttlSet(cacheKey, channel)
    return { status: 'ok', channel }
  } catch {
    return { status: 'error' }
  }
}
