import type { YouTubeVideo } from './youtubeApi'

export type SortOrder = 'newest' | 'oldest' | 'views'

export const SORT_LABELS: Record<SortOrder, string> = { newest: 'Newest', oldest: 'Oldest', views: 'Most viewed' }

function dateOf(v: YouTubeVideo): number | null {
  const t = Date.parse(v.publishedAt)
  return Number.isNaN(t) ? null : t
}

function viewsOf(v: YouTubeVideo): number | null {
  if (v.viewCount === undefined || v.viewCount === '') return null
  const n = Number(v.viewCount)
  return Number.isFinite(n) ? n : null
}

/**
 * A sorted copy. Sorting costs no quota: it orders what was already fetched. A video with no date (or no view count, for
 * "most viewed") goes last whichever way it sorts, in the order it came; the sort is stable.
 */
export function sortVideos(videos: YouTubeVideo[], order: SortOrder): YouTubeVideo[] {
  const key = order === 'views' ? viewsOf : dateOf
  const sign = order === 'oldest' ? 1 : -1
  return videos
    .map((video, index) => ({ video, index, value: key(video) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index
        return a.value === null ? 1 : -1
      }
      return a.value === b.value ? a.index - b.index : sign * (a.value - b.value)
    })
    .map((e) => e.video)
}
