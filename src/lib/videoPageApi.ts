/**
 * Data API calls for the YouTube player page. Every export is cached (localStorage, see ttlCache) and never
 * throws: a missing key, a refusal or a dead network becomes a status or an empty answer. Quota: videos 1,
 * comments 1, playlist page 1, topic search 100 (so it runs only when the viewer clicks a topic).
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import { searchYouTubeVideos, type YouTubeSearchResult } from './youtubeApi'
import { ttlGet, ttlSet } from './ttlCache'
import { noteApiFailure } from './youtubeQuota'

const BASE = 'https://www.googleapis.com/youtube/v3'
const DAY_MS = 24 * 60 * 60 * 1000
const COMMENTS_TTL_MS = 30 * 60 * 1000
const prefix = STORAGE_KEYS.LOCAL_VIDEO_PAGE_CACHE_PREFIX
const MISSING_TTL_MS = 60 * 60 * 1000

export interface VideoPageData {
  id: string
  title: string
  channelTitle: string
  channelId: string
  thumbnail: string
  publishedAt: string
  viewCount?: string
  description: string
  tags: string[]
  topics: string[]
  /** Whether it is a live stream right now. Read fresh for live and upcoming videos (they are never cached). */
  live: VideoLiveState
}

export interface VideoLiveState {
  state: 'live' | 'upcoming' | 'none'
  viewerCount: number | null
  startedAt: string | null
}

const NOT_LIVE: VideoLiveState = { state: 'none', viewerCount: null, startedAt: null }

export interface VideoComment {
  id: string
  author: string
  authorImage: string
  text: string
  likeCount: number
  publishedAt: string
  replyCount: number
}

export type CommentsResult = { status: 'ok'; comments: VideoComment[] } | { status: 'disabled' } | { status: 'error' }

export interface PlaylistItem {
  id: string
  title: string
  thumbnail: string
}

export type PlaylistResult =
  | { status: 'ok'; items: PlaylistItem[]; nextPageToken: string | null; totalResults: number }
  | { status: 'unreadable' }

class ApiFailure extends Error {
  status: number
  reason?: string
  constructor(status: number, reason?: string) {
    super(`YouTube API ${status}${reason ? ` (${reason})` : ''}`)
    this.status = status
    this.reason = reason
  }
}

async function get(path: string, params: Record<string, string>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const key = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined
  if (!key) throw new ApiFailure(0, 'noKey')
  const res = await fetch(`${BASE}/${path}?${new URLSearchParams({ ...params, key })}`)
  if (!res.ok) {
    let reason: string | undefined
    try {
      reason = (await res.json())?.error?.errors?.[0]?.reason
    } catch {
      /* no JSON body */
    }
    noteApiFailure(res.status, reason)
    throw new ApiFailure(res.status, reason)
  }
  return res.json()
}

export { get as youtubeGet }

const thumbOf =(t: any): string => t?.medium?.url ?? t?.default?.url ?? '' // eslint-disable-line @typescript-eslint/no-explicit-any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function liveStateOf(it: any): VideoLiveState {
  const b = it.snippet?.liveBroadcastContent
  if (b !== 'live' && b !== 'upcoming') return NOT_LIVE
  const viewers = it.liveStreamingDetails?.concurrentViewers
  return {
    state: b,
    viewerCount: viewers === undefined ? null : Number(viewers),
    startedAt: it.liveStreamingDetails?.actualStartTime ?? null,
  }
}

/** Everything the page shows about a video. 1 unit, cached 24 h. Null when there is no key or no such video. */
export async function getVideoPage(id: string): Promise<VideoPageData | null> {
  const cacheKey = `${prefix}video_${id}`
  const cached = ttlGet<VideoPageData>(cacheKey, DAY_MS)
  // An entry saved before live states existed may be a stream that is live now: it is read again (once; the new
  // answer replaces it, or is not saved at all when it is live).
  if (cached?.live) return cached
  // A video YouTube said does not exist is remembered for an hour, so a dead link does not cost a unit per visit.
  const missingKey = `${prefix}missing_${id}`
  if (ttlGet<boolean>(missingKey, MISSING_TTL_MS)) return null
  try {
    const data = await get('videos', { part: 'snippet,statistics,topicDetails,liveStreamingDetails', id })
    const it = data.items?.[0]
    if (!it) {
      ttlSet(missingKey, true)
      return null
    }
    const result: VideoPageData = {
      id: it.id,
      title: it.snippet.title,
      channelTitle: it.snippet.channelTitle,
      channelId: it.snippet.channelId ?? '',
      thumbnail: thumbOf(it.snippet.thumbnails),
      publishedAt: it.snippet.publishedAt,
      viewCount: it.statistics?.viewCount,
      description: it.snippet.description ?? '',
      tags: it.snippet.tags ?? [],
      topics: (it.topicDetails?.topicCategories ?? []).map((u: string) =>
        decodeURIComponent(u.split('/').pop() ?? '').replace(/_/g, ' '),
      ),
      live: liveStateOf(it),
    }
    // A live or upcoming video changes state, so it is asked again on every visit (still 1 unit).
    if (result.live.state === 'none') ttlSet(cacheKey, result)
    return result
  } catch {
    return null
  }
}

/** The top comments by relevance, as plain text. 1 unit; only a good answer is cached (30 min). */
export async function getComments(id: string, max = 20): Promise<CommentsResult> {
  const cacheKey = `${prefix}comments_${id}`
  const cached = ttlGet<CommentsResult>(cacheKey, COMMENTS_TTL_MS)
  if (cached) return cached
  try {
    const data = await get('commentThreads', {
      part: 'snippet',
      videoId: id,
      order: 'relevance',
      textFormat: 'plainText',
      maxResults: String(max),
    })
    const result: CommentsResult = {
      status: 'ok',
      comments: (data.items ?? []).map((t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const s = t.snippet.topLevelComment.snippet
        return {
          id: t.id,
          author: s.authorDisplayName,
          authorImage: s.authorProfileImageUrl ?? '',
          text: s.textDisplay,
          likeCount: s.likeCount ?? 0,
          publishedAt: s.publishedAt,
          replyCount: t.snippet.totalReplyCount ?? 0,
        }
      }),
    }
    ttlSet(cacheKey, result)
    return result
  } catch (err) {
    if (err instanceof ApiFailure && err.reason === 'commentsDisabled') {
      const off: CommentsResult = { status: 'disabled' }
      ttlSet(cacheKey, off)
      return off
    }
    return { status: 'error' }
  }
}

/** One page (50) of a playlist, without private or deleted entries. 1 unit, cached 24 h. */
export async function getPlaylistItems(listId: string, pageToken?: string): Promise<PlaylistResult> {
  const cacheKey = `${prefix}list_${listId}_${pageToken ?? ''}`
  const cached = ttlGet<PlaylistResult>(cacheKey, DAY_MS)
  if (cached) return cached
  try {
    const params: Record<string, string> = { part: 'snippet,status', playlistId: listId, maxResults: '50' }
    if (pageToken) params.pageToken = pageToken
    const data = await get('playlistItems', params)
    const items: PlaylistItem[] = (data.items ?? [])
      .filter((e: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
        e.status?.privacyStatus !== 'private' && e.snippet?.title !== 'Deleted video' && e.snippet?.title !== 'Private video',
      )
      .map((e: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: e.snippet.resourceId.videoId,
        title: e.snippet.title,
        thumbnail: thumbOf(e.snippet.thumbnails),
      }))
    const result: PlaylistResult = {
      status: 'ok',
      items,
      nextPageToken: data.nextPageToken ?? null,
      totalResults: data.pageInfo?.totalResults ?? items.length,
    }
    ttlSet(cacheKey, result)
    return result
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * The cache key for a search: lower case, letters and numbers of any language only, single spaces. So "Minecraft  Speedrun",
 * "minecraft speedrun!" and "Minecraft, speedrun?" are one search and cost 100 units once; "café" and "cafe" stay two.
 */
export function normaliseQuery(q: string): string {
  return q.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export interface TopicPage {
  videos: YouTubeSearchResult[]
  nextPageToken: string | null
}

const searching = new Map<string, Promise<TopicPage>>()

/**
 * One page (8) of a search. 100 units, so only on a click; every page is cached 24 h per normalised query (an empty page
 * too; a failure is not) and answers empty on failure. The same page asked while it is still running shares that one
 * search (a double click costs 100, not 200). The first page is cached under the key `searchTopic` always used, in
 * either format: an older entry that is just the list of videos reads as a page with no next page.
 */
export async function searchTopicPage(q: string, pageToken?: string): Promise<TopicPage> {
  const query = normaliseQuery(q)
  if (!query) return { videos: [], nextPageToken: null }
  const cacheKey = `${prefix}topic_${query}${pageToken ? `_p_${pageToken}` : ''}`
  const cached = ttlGet<TopicPage | YouTubeSearchResult[]>(cacheKey, DAY_MS)
  if (cached) return Array.isArray(cached) ? { videos: cached, nextPageToken: null } : cached
  const running = searching.get(cacheKey)
  if (running) return running
  const search = (async (): Promise<TopicPage> => {
    try {
      const { videos, nextPageToken } = await searchYouTubeVideos(q, 8, pageToken)
      const page = { videos, nextPageToken: nextPageToken ?? null }
      ttlSet(cacheKey, page)
      return page
    } catch {
      return { videos: [], nextPageToken: null }
    }
  })().finally(() => searching.delete(cacheKey))
  searching.set(cacheKey, search)
  return search
}

/** Videos for a topic: the first page of `searchTopicPage`. */
export async function searchTopic(q: string): Promise<YouTubeSearchResult[]> {
  return (await searchTopicPage(q)).videos
}
