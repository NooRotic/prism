import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useFollowedChannels } from '../../hooks/useFollowedChannels'
import { useSessionExpiry } from '../../hooks/useSessionExpiry'
import { computeFollowStats, groupCategories, mostWatched, recentlyStarted } from '../../lib/dashboardStats'
import { sortNewestLiveFirst } from '../../lib/sortLiveFollows'
import CategoryRows from './CategoryRows'
import DashboardSkeleton from './DashboardSkeleton'
import FollowCards from './FollowCards'
import FollowChips from './FollowChips'
import IdentityStrip from './IdentityStrip'
import LiveWall from './LiveWall'
import { useChatColor } from './useChatColor'
import { useNow } from './useNow'
import { useWallCap } from './useWallCap'

const TWITCH_DIRECTORY = 'https://www.twitch.tv/directory'

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md p-4 text-sm"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  )
}

function DirectoryLink() {
  return (
    <a
      href={TWITCH_DIRECTORY}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: 'var(--accent-twitch)' }}
    >
      Browse live channels on Twitch
    </a>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-3 py-1 text-xs"
      style={{ border: '1px solid var(--border-accent)', color: 'var(--text-primary)' }}
    >
      Retry
    </button>
  )
}

/**
 * The `/twitch` page for a signed-in viewer: who they follow that is live and the
 * figures that go with it. The follows come from the shared follows store (the
 * rail and the Following panel read the same copy), so this adds no polling.
 */
export default function TwitchDashboard() {
  const { state, dispatch } = useApp()
  const onSessionExpired = useSessionExpiry()
  const user = state.auth.user
  const userId = user?.id ?? null

  const follows = useFollowedChannels(userId, { handleAuthError: onSessionExpired })
  const chatColor = useChatColor(userId, onSessionExpired)
  const cap = useWallCap()
  const now = useNow()

  const { data } = follows
  const live = useMemo(() => sortNewestLiveFirst(data.filter((f) => f.isLive)), [data])
  const stats = useMemo(() => computeFollowStats(data, now), [data, now])
  const categories = useMemo(() => groupCategories(data), [data])
  const recent = useMemo(() => recentlyStarted(data), [data])
  const top = useMemo(() => mostWatched(data), [data])

  if (user === null) {
    if (state.auth.profileError) {
      return (
        <Panel>
          <p>We could not load your Twitch profile.</p>
          <RetryButton onClick={() => dispatch({ type: 'LOGIN_USER_RETRY' })} />
        </Panel>
      )
    }
    return <DashboardSkeleton />
  }

  if (follows.loading) return <DashboardSkeleton />

  if (follows.error) {
    return (
      <Panel>
        <p>{follows.error}</p>
        <RetryButton onClick={follows.refetch} />
      </Panel>
    )
  }

  const more = follows.cursor !== null
  const offlineCount = data.length - live.length
  const strip = (
    <IdentityStrip
      user={user}
      chatColor={chatColor}
      following={follows.loadedCount}
      followingMore={more}
      liveCount={stats.liveCount}
      watching={stats.watching}
    />
  )

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {strip}
        <Panel>
          <p>You don&apos;t follow anyone on Twitch yet.</p>
          <DirectoryLink />
        </Panel>
      </div>
    )
  }

  const openFollowing = () => dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })

  return (
    <div className="flex flex-col gap-4">
      {strip}
      <FollowChips stats={stats} more={more} />

      {live.length === 0 ? (
        <Panel>
          <p>No one you follow is live</p>
          <button type="button" onClick={openFollowing} aria-label={`${offlineCount}${more ? '+' : ''} offline, open Following`}>
            {offlineCount}
            {more ? '+' : ''} offline ▸
          </button>
          <DirectoryLink />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
          <LiveWall
            live={live}
            offlineCount={offlineCount}
            more={more}
            now={now}
            cap={cap}
            onOpenFollowing={openFollowing}
          />
          <div className="flex flex-col gap-4">
            <CategoryRows
              rows={categories}
              onOpen={(name) => dispatch({ type: 'OPEN_CATEGORY_PANEL', category: name })}
            />
            <FollowCards recent={recent} top={top} now={now} />
          </div>
        </div>
      )}
    </div>
  )
}
