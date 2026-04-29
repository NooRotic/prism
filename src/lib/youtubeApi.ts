const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined
const BASE = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeVideo {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  viewCount?: string
  publishedAt: string
  description: string
}

export interface YouTubeSearchResult {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
}

export interface YouTubePagedResult<T> {
  videos: T[]
  nextPageToken: string | null
}

function assertKey(): string {
  if (!API_KEY) throw new Error('VITE_YOUTUBE_API_KEY is not set')
  return API_KEY
}

/** Fetch most popular videos (1 quota unit per call) */
export async function getPopularVideos(
  maxResults = 12,
  regionCode = 'US',
  pageToken?: string,
): Promise<YouTubePagedResult<YouTubeVideo>> {
  const key = assertKey()
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    maxResults: String(maxResults),
    regionCode,
    key,
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${BASE}/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()
  return { videos: (data.items ?? []).map(mapVideo), nextPageToken: data.nextPageToken ?? null }
}

/** Search videos (100 quota units per call — use sparingly) */
export async function searchYouTubeVideos(
  query: string,
  maxResults = 8,
  pageToken?: string,
): Promise<YouTubePagedResult<YouTubeSearchResult>> {
  const key = assertKey()
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(maxResults),
    key,
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${BASE}/search?${params}`)
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()
  return { videos: (data.items ?? []).map(mapSearchResult), nextPageToken: data.nextPageToken ?? null }
}

/** Get details for specific video IDs (1 quota unit) */
export async function getVideoDetails(ids: string[]): Promise<YouTubeVideo[]> {
  if (ids.length === 0) return []
  const key = assertKey()
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    id: ids.join(','),
    key,
  })
  const res = await fetch(`${BASE}/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()
  return (data.items ?? []).map(mapVideo)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
function mapVideo(item: Record<string, any>): YouTubeVideo {
  return {
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
    viewCount: item.statistics?.viewCount,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API JSON response
function mapSearchResult(item: Record<string, any>): YouTubeSearchResult {
  return {
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
  }
}

export function isYouTubeApiAvailable(): boolean {
  return !!API_KEY
}
