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
}

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

const thumbOf = (t: any): string => t?.medium?.url ?? t?.default?.url ?? '' // eslint-disable-line @typescript-eslint/no-explicit-any

/** Everything the page shows about a video. 1 unit, cached 24 h. Null when there is no key or no such video. */
export async function getVideoPage(id: string): Promise<VideoPageData | null> {
  const cacheKey = `${prefix}video_${id}`
  const cached = ttlGet<VideoPageData>(cacheKey, DAY_MS)
  if (cached) return cached
  try {
    const data = await get('videos', { part: 'snippet,statistics,topicDetails', id })
    const it = data.items?.[0]
    if (!it) return null
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
    }
    ttlSet(cacheKey, result)
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
    return err instanceof ApiFailure && err.reason === 'commentsDisabled' ? { status: 'disabled' } : { status: 'error' }
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

const searching = new Map<string, Promise<YouTubeSearchResult[]>>()

/**
 * Videos for a topic. 100 units, so only on a click; cached 24 h per lower-cased query. Empty on any failure.
 * The same query asked while its search is still running shares that one search (a double click costs 100, not 200).
 */
export async function searchTopic(q: string): Promise<YouTubeSearchResult[]> {
  const query = q.trim().toLowerCase()
  const cacheKey = `${prefix}topic_${query}`
  const cached = ttlGet<YouTubeSearchResult[]>(cacheKey, DAY_MS)
  if (cached) return cached
  const running = searching.get(query)
  if (running) return running
  const search = (async () => {
    try {
      const { videos } = await searchYouTubeVideos(q, 8)
      ttlSet(cacheKey, videos)
      return videos
    } catch {
      return []
    }
  })().finally(() => searching.delete(query))
  searching.set(query, search)
  return search
}
