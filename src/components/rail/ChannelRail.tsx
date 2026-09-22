import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Heart, Compass, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { useFollowedChannels } from '../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../hooks/useCategoryRail'
import { useRailAvatars } from '../../hooks/useRailAvatars'
import ConnectTwitchPrompt from '../ui/ConnectTwitchPrompt'
import RailSection, { RAIL_SECTION_CAP } from './RailSection'
import { useRailPosition } from './useRailPosition'
import type { RailEntry } from './types'

/** Sweeping past a stack of avatars must not strobe panels open. */
const OPEN_DELAY_MS = 120
/** Diagonal travel from avatar to panel must not dismiss it mid-move. */
const CLOSE_DELAY_MS = 200

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH = 260
/** Above player chrome (10/20), below SlidedownPanel (30) and Header (40). */
const RAIL_Z_INDEX = 25

/** Placeholder circles shown in the Following slot while its data is in flight. */
const LOADING_PLACEHOLDER_COUNT = 5
/** Matches RailEntryCard's AVATAR_SIZE so the collapsed strip doesn't jump when data arrives. */
const LOADING_PLACEHOLDER_SIZE = 40

export default function ChannelRail() {
  const { state, dispatch } = useApp()
  const { isAuthenticated, login, handleAuthError } = useTwitchAuth()
  const { position, flip } = useRailPosition()

  const [expanded, setExpanded] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const openAfterDelay = useCallback(() => {
    clearTimers()
    openTimer.current = setTimeout(() => setExpanded(true), OPEN_DELAY_MS)
  }, [clearTimers])

  const closeAfterDelay = useCallback(() => {
    clearTimers()
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }, [clearTimers])

  const openNow = useCallback(() => {
    clearTimers()
    setExpanded(true)
  }, [clearTimers])

  const closeNow = useCallback(() => {
    clearTimers()
    setExpanded(false)
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  // Escape and outside-tap. Touch devices have no hover, so a tap elsewhere
  // is the only dismissal gesture available to them.
  useEffect(() => {
    if (!expanded) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow()
    }
    const onOutside = (e: Event) => {
      const node = containerRef.current
      if (node && !node.contains(e.target as Node)) closeNow()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [expanded, closeNow])

  // --- Data ---------------------------------------------------------------
  // Signed out, both hooks are handed null and become no-ops. The rail makes
  // no API calls at all in that state.
  const userId = isAuthenticated ? (state.auth.user?.id ?? null) : null
  const authOptions = useMemo(
    () => ({ handleAuthError: () => handleAuthError(undefined) }),
    [handleAuthError],
  )
  const follows = useFollowedChannels(userId, authOptions)

  const gameId = isAuthenticated ? (state.channel.stream?.game_id ?? null) : null
  const currentUserId = state.channel.stream?.user_id ?? null
  const category = useCategoryRail(gameId, currentUserId)

  // A failing section hides itself and leaves its siblings intact. This is
  // the invariant that makes a second platform safe to add.
  const liveFollows = useMemo(
    () => (follows.error ? [] : follows.data.filter((f) => f.isLive)),
    [follows.error, follows.data],
  )
  const recommendations = useMemo(
    () => (category.error ? [] : category.streams),
    [category.error, category.streams],
  )

  const avatarIds = useMemo(
    () => [
      ...liveFollows.slice(0, RAIL_SECTION_CAP).map((f) => f.broadcaster_id),
      ...recommendations.map((s) => s.user_id),
    ],
    [liveFollows, recommendations],
  )
  const avatars = useRailAvatars(avatarIds)

  const followEntries: RailEntry[] = useMemo(
    () =>
      liveFollows.map((f) => ({
        id: `twitch:${f.broadcaster_id}`,
        displayName: f.broadcaster_name,
        avatarUrl: avatars.get(f.broadcaster_id) ?? '',
        href: `/twitch/${f.broadcaster_login}`,
        isLive: true,
        viewerCount: f.viewerCount ?? null,
        streamTitle: f.streamTitle ?? null,
        gameName: f.gameName ?? null,
        startedAt: f.startedAt ?? null,
      })),
    [liveFollows, avatars],
  )

  const categoryEntries: RailEntry[] = useMemo(
    () =>
      recommendations.map((s) => ({
        id: `twitch:${s.user_id}`,
        displayName: s.user_name,
        avatarUrl: avatars.get(s.user_id) ?? '',
        href: `/twitch/${s.user_login}`,
        isLive: true,
        viewerCount: s.viewer_count ?? null,
        streamTitle: s.title ?? null,
        gameName: s.game_name ?? null,
        startedAt: s.started_at ?? null,
      })),
    [recommendations, avatars],
  )

  const openFollowingPanel = useCallback(() => {
    dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
  }, [dispatch])

  // The follows section shows dimmed placeholders instead of its RailSection
  // while its first fetch is in flight. Recommendations load and fail
  // independently of follows, so this never gates the category section.
  const showFollowsLoading = isAuthenticated && follows.loading && followEntries.length === 0

  // Signed in with nothing to show: unmount rather than leave an empty strip
  // occluding video for no reason. A loading rail is not "nothing to show" —
  // it stays mounted so the placeholders above can render.
  const hasContent = followEntries.length > 0 || categoryEntries.length > 0
  if (isAuthenticated && !hasContent && !showFollowsLoading) return null

  const edge = position === 'left' ? { left: 0 } : { right: 0 }

  return (
    <div
      ref={containerRef}
      data-testid="channel-rail"
      onMouseEnter={openAfterDelay}
      onMouseLeave={closeAfterDelay}
      onFocus={openNow}
      onBlur={closeAfterDelay}
      onTouchStart={openNow}
      className="flex flex-col gap-2 overflow-y-auto py-3 transition-[width] duration-150"
      style={{
        position: 'fixed',
        top: 'var(--header-height)',
        bottom: 0,
        ...edge,
        width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        zIndex: RAIL_Z_INDEX,
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        backdropFilter: 'blur(8px)',
        borderLeft:
          position === 'right' ? '1px solid var(--border)' : undefined,
        borderRight: position === 'left' ? '1px solid var(--border)' : undefined,
      }}
    >
      {!isAuthenticated ? (
        expanded ? (
          <ConnectTwitchPrompt
            title="Channel rail"
            description="Connect Twitch to see who you follow that's live"
            onConnect={login}
            className="px-2"
          />
        ) : (
          <button
            type="button"
            onClick={openNow}
            aria-label="Connect Twitch to see your live follows"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-twitch)', color: '#fff' }}
          >
            <Heart size={16} />
          </button>
        )
      ) : (
        <>
          {showFollowsLoading ? (
            <div className="flex flex-col gap-1" aria-hidden="true">
              {Array.from({ length: LOADING_PLACEHOLDER_COUNT }).map((_, i) => (
                <div
                  key={i}
                  data-testid="rail-placeholder"
                  aria-hidden="true"
                  className="mx-2 my-1.5"
                  style={{
                    width: LOADING_PLACEHOLDER_SIZE,
                    height: LOADING_PLACEHOLDER_SIZE,
                    borderRadius: '9999px',
                    background: 'var(--border)',
                    opacity: 0.4,
                  }}
                />
              ))}
            </div>
          ) : (
            <RailSection
              label="Following"
              icon={<Heart size={16} style={{ color: 'var(--accent-green)' }} />}
              entries={followEntries}
              expanded={expanded}
              totalCount={followEntries.length}
              onOverflowClick={openFollowingPanel}
            />
          )}
          <RailSection
            label="Category"
            icon={<Compass size={16} style={{ color: 'var(--accent-twitch)' }} />}
            entries={categoryEntries}
            expanded={expanded}
          />
        </>
      )}

      <button
        type="button"
        onClick={flip}
        aria-label={`Move rail to the ${position === 'left' ? 'right' : 'left'}`}
        className="mx-auto mt-auto rounded-md p-1.5 transition-colors duration-150 hover:bg-white/5"
        style={{ color: 'var(--text-muted)' }}
      >
        {position === 'left' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  )
}
