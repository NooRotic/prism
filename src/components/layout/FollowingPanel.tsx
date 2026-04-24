import { useCallback, useMemo } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import {
  useFollowedChannels,
  sortFollows,
} from '../../hooks/useFollowedChannels'
import type { FollowingSort, FollowingSortMode } from '../../contexts/AppContext'
import FollowedChannelCard from './FollowedChannelCard'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import SlidedownPanel from './SlidedownPanel'

const SORT_OPTIONS: { id: FollowingSortMode; label: string }[] = [
  { id: 'live-first', label: 'Live first' },
  { id: 'alpha', label: 'Alphabetical' },
  { id: 'viewers', label: 'Most viewers' },
]

export default function FollowingPanel() {
  const { state, dispatch } = useApp()
  const { handleAuthError } = useTwitchAuth()

  const isOpen = state.navPanel.open === 'following'
  const sort = state.navPanel.followingSort
  const authUserId = state.auth.user?.id ?? null

  const handleAuthErrorCallback = useCallback(
    () => handleAuthError(null),
    [handleAuthError],
  )
  const fetchOptions = useMemo(
    () => ({ handleAuthError: handleAuthErrorCallback }),
    [handleAuthErrorCallback],
  )

  // Only run the fetch when the panel is actually opened AND the auth user
  // is loaded. Keeps the API call lazy until the user expresses interest.
  const fetchUserId = isOpen ? authUserId : null
  const { data, totalCount, loadedCount, liveCount, loading, loadingMore, error, cursor, loadMore } = useFollowedChannels(
    fetchUserId,
    fetchOptions,
  )

  const sortedData = useMemo(() => sortFollows(data, sort), [data, sort])

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch])

  const setSort = useCallback(
    (mode: FollowingSortMode) => {
      const defaults: Record<FollowingSortMode, 'asc' | 'desc'> = {
        'live-first': 'desc',
        alpha: 'asc',
        viewers: 'desc',
      }
      dispatch({ type: 'SET_FOLLOWING_SORT', sort: { mode, dir: defaults[mode] } })
    },
    [dispatch],
  )

  const toggleDir = useCallback(() => {
    dispatch({
      type: 'SET_FOLLOWING_SORT',
      sort: { mode: sort.mode, dir: sort.dir === 'asc' ? 'desc' : 'asc' },
    })
  }, [dispatch, sort])

  return (
    <SlidedownPanel panelId="following" ariaLabel="Following panel">
      {/* Header row: title + summary + close */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2
            className="text-xl font-bold font-heading"
            style={{ color: 'var(--accent-green)', letterSpacing: '0.08em' }}
          >
            Following
          </h2>
          {totalCount > 0 && (
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {totalCount}
              </span>{' '}
              channels
              {cursor && (
                <span style={{ color: 'var(--text-muted)' }}> (showing {loadedCount})</span>
              )}
              {' · '}
              <span
                style={{
                  color:
                    liveCount > 0
                      ? 'var(--accent-green)'
                      : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {liveCount} live now
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close Following panel"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10"
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

      {/* Sort chips */}
      {data.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Sort:
          </span>
          {SORT_OPTIONS.map((opt) => {
            const active = sort.mode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSort(opt.id)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: active
                    ? 'rgba(57, 255, 20, 0.15)'
                    : 'var(--bg-card)',
                  border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
                  color: active
                    ? 'var(--accent-green)'
                    : 'var(--text-secondary)',
                }}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={toggleDir}
            className="px-2 py-1 rounded-full text-xs font-bold transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            aria-label={sort.dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
            title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sort.dir === 'asc' ? '▲' : '▼'}
          </button>
        </div>
      )}

      {/* Body: loading / error / empty / grid */}
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
          <span className="text-sm">Loading followed channels…</span>
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

      {!loading && !error && data.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-4 py-16 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-base max-w-md" style={{ color: 'var(--text-secondary)' }}>
            You don&apos;t follow any channels yet. Head over to{' '}
            <a
              href="https://www.twitch.tv/directory"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
              style={{ color: 'var(--accent-green)' }}
            >
              Twitch directory
              <ExternalLink size={12} />
            </a>{' '}
            to find some.
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            You can start by following{' '}
            <a
              href="https://www.twitch.tv/nooroticx"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold"
              style={{ color: 'var(--accent-twitch)' }}
            >
              NooRoticX
            </a>{' '}
            ;)
          </p>
        </div>
      )}

      {!loading && !error && sortedData.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-2">
            {sortedData.map((follow) => (
              <FollowedChannelCard
                key={follow.broadcaster_id}
                follow={follow}
              />
            ))}
          </div>
          {cursor && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-green)' }} />
                ) : null}
                {loadingMore ? 'Loading…' : 'Load more channels'}
              </button>
            </div>
          )}
        </>
      )}
    </SlidedownPanel>
  )
}
