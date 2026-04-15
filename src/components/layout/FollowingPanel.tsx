import { useCallback, useEffect, useMemo, useRef } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import {
  useFollowedChannels,
  sortFollows,
} from '../../hooks/useFollowedChannels'
import type { FollowingSort } from '../../contexts/AppContext'
import FollowedChannelCard from './FollowedChannelCard'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

const SORT_OPTIONS: { id: FollowingSort; label: string }[] = [
  { id: 'live-first', label: 'Live first' },
  { id: 'alpha', label: 'Alphabetical' },
  { id: 'viewers', label: 'Most viewers' },
]

export default function FollowingPanel() {
  const { state, dispatch } = useApp()
  const { handleAuthError } = useTwitchAuth()
  const panelRef = useRef<HTMLDivElement>(null)

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
  const { data, totalCount, liveCount, loading, error } = useFollowedChannels(
    fetchUserId,
    fetchOptions,
  )

  const sortedData = useMemo(() => sortFollows(data, sort), [data, sort])

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch])

  const setSort = useCallback(
    (next: FollowingSort) => {
      dispatch({ type: 'SET_FOLLOWING_SORT', sort: next })
    },
    [dispatch],
  )

  // ESC key closes the panel
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, close])

  // Click-outside closes the panel. We listen on mousedown to match the
  // pattern used by SmartUrlInput's dropdown and avoid racing with open/close
  // triggers coming from the header nav button.
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current && !panelRef.current.contains(target)) {
        // Ignore clicks on the header nav button itself — that button's
        // own click handler will toggle the panel. We let it run and it
        // handles dismissal via the TOGGLE_NAV_PANEL reducer.
        const headerNav = document.querySelector('[data-nav-trigger]')
        if (headerNav && headerNav.contains(target)) return
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, close])

  return (
    <div
      ref={panelRef}
      aria-hidden={!isOpen}
      aria-label="Following panel"
      role="region"
      className="brushed-metal fixed left-0 right-0 overflow-y-auto transition-transform duration-300 ease-out"
      style={{
        top: 'var(--header-height, 56px)',
        maxHeight: 'calc(100vh - var(--header-height, 56px))',
        // z-9 sits below the header (z-10) so the header visually
        // "covers" the top edge as the panel slides out from under it.
        zIndex: 9,
        // No backgroundColor inline — the brushed-metal class provides
        // the base color + SVG turbulence background-image.
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        transform: isOpen ? 'translateY(0)' : 'translateY(-100%)',
        // When closed, forbid pointer events so the hidden panel doesn't
        // intercept clicks on the content underneath it.
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-4">
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
              const active = sort === opt.id
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
            {sortedData.map((follow) => (
              <FollowedChannelCard
                key={follow.broadcaster_id}
                follow={follow}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
