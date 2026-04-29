import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  getPopularVideos,
  searchYouTubeVideos,
  isYouTubeApiAvailable,
  type YouTubeVideo,
} from '../../lib/youtubeApi'
import {
  getCachedResults,
  setCachedResults,
  appendCachedPage,
  invalidateCache,
  invalidateAllCache,
} from '../../lib/youtubeCache'
import { DEFAULT_CATEGORY_ID, getCategoryById } from '../../config/youtubeCategories'
import { YouTubeCategoryBar } from './YouTubeCategoryBar'
import { YouTubeVideoCard } from './YouTubeVideoCard'

/** Fetch videos for a category, returning normalized YouTubeVideo[] + pagination token. */
async function fetchFromApi(categoryId: string, pageToken?: string) {
  const category = getCategoryById(categoryId)
  if (categoryId === 'popular') {
    const result = await getPopularVideos(12, 'US', pageToken)
    return { videos: result.videos, nextPageToken: result.nextPageToken, query: '' }
  }
  const searchQuery = category?.searchQuery ?? categoryId
  const result = await searchYouTubeVideos(searchQuery, 12, pageToken)
  const normalized: YouTubeVideo[] = result.videos.map((r) => ({
    ...r,
    viewCount: undefined,
    publishedAt: '',
    description: '',
  }))
  return { videos: normalized, nextPageToken: result.nextPageToken, query: searchQuery }
}

export function YouTubeGrid() {
  const [activeCategory, setActiveCategory] = useState(DEFAULT_CATEGORY_ID)
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Tracks the current fetch generation — incremented on category change or refresh
  // so in-flight requests from previous generations are discarded
  const fetchGenRef = useRef(0)

  useEffect(() => {
    const gen = ++fetchGenRef.current

    async function run() {
      setLoading(true)
      setError(null)

      if (!isYouTubeApiAvailable()) {
        if (gen === fetchGenRef.current) {
          setError('YouTube API key not configured')
          setLoading(false)
        }
        return
      }

      // Check cache (with query mismatch detection)
      const cached = getCachedResults(activeCategory)
      if (cached) {
        const expectedQuery = getCategoryById(activeCategory)?.searchQuery ?? ''
        if (cached.query === expectedQuery) {
          if (gen === fetchGenRef.current) {
            setVideos(cached.videos)
            setNextPageToken(cached.nextPageToken)
            setLoading(false)
          }
          return
        }
        // Query mismatch — stale cache, invalidate and re-fetch
        invalidateCache(activeCategory)
      }

      try {
        const result = await fetchFromApi(activeCategory)
        if (gen !== fetchGenRef.current) return // stale — discard
        setCachedResults(activeCategory, {
          videos: result.videos,
          nextPageToken: result.nextPageToken,
          timestamp: Date.now(),
          query: result.query,
        })
        setVideos(result.videos)
        setNextPageToken(result.nextPageToken)
      } catch (err) {
        if (gen !== fetchGenRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to load videos')
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false)
        }
      }
    }

    run() // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch on category/refresh change
  }, [activeCategory, refreshCounter])

  function handleSelectCategory(categoryId: string) {
    setActiveCategory(categoryId)
    setVideos([])
    setNextPageToken(null)
    setLoadingMore(false)
  }

  function handleRefresh(categoryId: string) {
    invalidateCache(categoryId)
    setVideos([])
    setNextPageToken(null)
    setLoadingMore(false)
    setRefreshCounter((c) => c + 1)
  }

  function handleRefreshAll() {
    invalidateAllCache()
    setVideos([])
    setNextPageToken(null)
    setLoadingMore(false)
    setRefreshCounter((c) => c + 1)
  }

  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return

    // Capture current generation — if category changes mid-load, discard results
    const gen = fetchGenRef.current
    setLoadingMore(true)
    try {
      const result = await fetchFromApi(activeCategory, nextPageToken)
      if (gen !== fetchGenRef.current) return // category changed — discard
      appendCachedPage(activeCategory, result.videos, result.nextPageToken)
      setVideos((prev) => [...prev, ...result.videos])
      setNextPageToken(result.nextPageToken)
    } catch (err) {
      if (gen !== fetchGenRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load more videos')
    } finally {
      if (gen === fetchGenRef.current) {
        setLoadingMore(false)
      }
    }
  }, [activeCategory, nextPageToken, loadingMore])

  return (
    <div className="flex flex-col gap-4">
      {/* Category pills bar + Refresh All button */}
      <div className="flex items-center justify-between">
        <YouTubeCategoryBar
          activeId={activeCategory}
          onSelect={handleSelectCategory}
          onRefresh={handleRefresh}
        />
        <button
          onClick={handleRefreshAll}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors duration-200 cursor-pointer shrink-0"
          style={{
            color: 'var(--text-muted)',
            border: 'none',
            background: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          aria-label="Refresh all categories"
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-youtube)' }} />
          <span className="ml-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading {getCategoryById(activeCategory)?.label ?? 'videos'}...
          </span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-md"
          style={{
            backgroundColor: 'rgba(255, 0, 0, 0.08)',
            border: '1px solid rgba(255, 0, 0, 0.3)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && videos.length === 0 && (
        <div className="py-16 text-center">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No videos found</span>
        </div>
      )}

      {/* Video grid */}
      {!loading && videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <YouTubeVideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {/* Load More button */}
      {!loading && nextPageToken && (
        <div className="flex justify-center py-4">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors duration-200 cursor-pointer"
            style={{
              color: 'var(--accent-youtube)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              backgroundColor: loadingMore ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
            }}
          >
            {loadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
