import { useCallback, useMemo } from 'react'
import { X, Loader2, ExternalLink, Eye, Heart, RefreshCw } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useCategoryStreams } from '../../hooks/useCategoryStreams'
import type { EnrichedCategoryStream } from '../../hooks/useCategoryStreams'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { detectURLType } from '../../lib/urlDetection'
import SlidedownPanel from './SlidedownPanel'

function StreamCard({ stream }: { stream: EnrichedCategoryStream }) {
  const { dispatch } = useApp()

  const handleClick = useCallback(() => {
    const url = `https://twitch.tv/${stream.user_login}`
    const detection = detectURLType(url)
    dispatch({ type: 'PLAY_URL', url, detection })
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch, stream.user_login])

  const thumbnailUrl = stream.thumbnail_url
    ? stream.thumbnail_url
        .replace('{width}', '320')
        .replace('{height}', '180')
    : null

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex flex-col rounded-lg text-left transition-all duration-200 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${stream.isFollowed ? 'var(--accent-green)' : 'var(--border)'}`,
      }}
      aria-label={`Open ${stream.user_name}'s stream`}
    >
      <div
        className="relative aspect-video w-full"
        style={{ backgroundColor: 'var(--bg-card-hover)' }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={stream.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Stream
          </div>
        )}

        {/* Live badge */}
        <span
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          Live
        </span>

        {/* Followed badge — only when the viewer follows this broadcaster */}
        {stream.isFollowed && (
          <span
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(57, 255, 20, 0.9)',
              color: '#000',
            }}
            title="You follow this channel"
          >
            <Heart size={10} fill="currentColor" />
            Following
          </span>
        )}

        {/* Viewer count */}
        <span
          className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
          }}
        >
          <Eye size={12} />
          {stream.viewer_count.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0">
        <p
          className="text-base font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
          title={stream.user_name}
        >
          {stream.user_name}
        </p>
        <p
          className="text-xs truncate"
          style={{ color: 'var(--text-secondary)' }}
          title={stream.title}
        >
          {stream.title}
        </p>
      </div>
    </button>
  )
}

export default function CategoryPanel() {
  const { state, dispatch } = useApp()
  const { handleAuthError } = useTwitchAuth()

  const categoryName =
    state.navPanel.open === 'category' ? state.navPanel.category : null
  const viewerUserId = state.auth.user?.id ?? null

  const handleAuthErrorCallback = useCallback(
    () => handleAuthError(null),
    [handleAuthError],
  )
  const fetchOptions = useMemo(
    () => ({ handleAuthError: handleAuthErrorCallback }),
    [handleAuthErrorCallback],
  )

  const { game, streams, loading, error, refetch } = useCategoryStreams(
    categoryName,
    viewerUserId,
    fetchOptions,
  )

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch])

  const liveCount = streams.length
  const followedLiveCount = useMemo(
    () => streams.filter((s) => s.isFollowed).length,
    [streams],
  )

  const boxArt = useMemo(() => {
    if (!game?.box_art_url) return null
    return game.box_art_url.replace('{width}', '52').replace('{height}', '72')
  }, [game])

  const directoryUrl = categoryName
    ? `https://www.twitch.tv/directory/category/${encodeURIComponent(categoryName)}`
    : null

  return (
    <SlidedownPanel panelId="category" ariaLabel="Category panel">
      <>
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {boxArt && (
              <img
                src={boxArt}
                alt={game?.name ?? ''}
                className="w-11 h-14 rounded object-cover shrink-0"
                style={{ border: '1px solid var(--border)' }}
              />
            )}
            <div className="min-w-0">
              <h2
                className="text-xl font-bold font-heading truncate"
                style={{
                  color: 'var(--accent-green)',
                  letterSpacing: '0.08em',
                }}
                title={categoryName ?? ''}
              >
                {categoryName ?? 'Category'}
              </h2>
              {!loading && !error && liveCount > 0 && (
                <p
                  className="text-sm mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span
                    style={{ color: 'var(--text-primary)', fontWeight: 600 }}
                  >
                    {liveCount}
                  </span>{' '}
                  live
                  {followedLiveCount > 0 && (
                    <>
                      {' · '}
                      <span
                        style={{
                          color: 'var(--accent-green)',
                          fontWeight: 600,
                        }}
                      >
                        {followedLiveCount} followed
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={refetch}
              disabled={loading || !categoryName}
              aria-label="Refresh category streams"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              }}
            >
              <RefreshCw
                size={14}
                className={loading ? 'animate-spin' : ''}
              />
              refresh
            </button>
            {directoryUrl && (
              <a
                href={directoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.05em',
                }}
              >
                <ExternalLink size={14} />
                twitch
              </a>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close Category panel"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              }}
            >
              <X size={14} />
              close
            </button>
          </div>
        </div>

        {/* Body */}
        {loading && (
          <div
            className="flex items-center justify-center gap-3 py-16"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2
              size={20}
              className="animate-spin"
              style={{ color: 'var(--accent-green)' }}
            />
            <span className="text-sm">Loading live streams…</span>
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-md"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && streams.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-16 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              No one is live in{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {categoryName}
              </span>{' '}
              right now.
            </p>
          </div>
        )}

        {!loading && !error && streams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
            {streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </>
    </SlidedownPanel>
  )
}
