import { useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useChannelData } from '../hooks/useChannelData'
import { useChannelLive } from '../hooks/useChannelLive'
import { useOfflineLayout } from '../hooks/useOfflineLayout'
import { useSessionExpiry } from '../hooks/useSessionExpiry'
import { useTwitchAuth } from '../hooks/useTwitchAuth'
import { lastStreamedAt } from '../lib/offlineLayout'
import { detectURLType } from '../lib/urlDetection'
import type { TwitchVideo } from '../types/twitch'
import PlayerHost from '../components/player/PlayerHost'
import ChatDock from '../components/chat/ChatDock'
import ChannelBody from '../components/channel/ChannelBody'
import OfflineLayout from '../components/channel/OfflineLayout'
import OfflineStrip from '../components/channel/OfflineStrip'
import { useNow } from '../components/dashboard/useNow'

/** The strip for the offline layout, with its own clock so "last live 2 hours ago" ticks without re-rendering the page. */
function PageOfflineStrip({
  videos,
  folded,
  onShowPlayer,
  live,
  onWatchLive,
}: {
  videos: TwitchVideo[]
  folded: boolean
  onShowPlayer: () => void
  live: boolean
  onWatchLive?: () => void
}) {
  const now = useNow()
  return (
    <OfflineStrip
      lastStreamedAt={lastStreamedAt(videos)}
      now={now}
      folded={folded}
      onShowPlayer={onShowPlayer}
      live={live}
      onWatchLive={onWatchLive}
    />
  )
}

export default function TwitchPlayerPage() {
  const { channel } = useParams<{ channel: string }>()
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated } = useTwitchAuth()
  const onSessionExpired = useSessionExpiry()
  const { player } = state

  const authErrorHandler = useCallback(
    () => handleAuthError(null),
    [handleAuthError],
  )

  // Trigger channel data fetch when route param changes
  const channelForApi = isAuthenticated ? (channel ?? null) : null
  const channelDataOptions = useMemo(
    () => ({ handleAuthError: authErrorHandler }),
    [authErrorHandler],
  )
  useChannelData(channelForApi, channelDataOptions)

  // A signed-in viewer of a channel that is not live gets the offline layout; while it shows, the
  // channel's live status is checked once a minute so the page can go back to the normal layout.
  const layout = useOfflineLayout(channel)
  useChannelLive({
    userId: state.channel.profile?.id ?? null,
    // Once it is live there is nothing left to wait for (this also covers the viewer who kept the
    // offline layout because they were watching something when it went live).
    enabled: layout.offline && !layout.live,
    onSessionExpired,
  })

  // The channel went live while the viewer was watching a recording: offer the way to the live
  // stream, and leave the player alone until they take it.
  const playsRecording =
    player.detection?.platform === 'twitch-clip' || player.detection?.platform === 'twitch-video'
  const watchLive = () => {
    const url = `https://twitch.tv/${channel}`
    dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) })
  }

  // Set player URL from route param
  useEffect(() => {
    if (!channel) return
    const url = `https://twitch.tv/${channel}`
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [channel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top on channel change, and whenever the player is pointed at
  // something: the clip and VOD grids and "Back to live" all sit below it, so
  // without this the new video would start out of view. Every PLAY_URL stores
  // a fresh `detection` object, so this also fires when the video already
  // playing is selected again, and not for state changes that leave it alone.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [channel, player.detection])

  // The offline layout also changes the page's top without touching the player's address:
  // when the channel goes live the player appears there, and "Show player" unfolds it.
  const previous = useRef({ offline: layout.offline, folded: layout.folded })
  useEffect(() => {
    const was = previous.current
    previous.current = { offline: layout.offline, folded: layout.folded }
    const wentLive = was.offline && !layout.offline
    const unfolded = layout.offline && was.folded && !layout.folded
    if (wentLive || unfolded) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [layout.offline, layout.folded])

  const playerNode =
    player.currentUrl && player.detection ? (
      <PlayerHost url={player.currentUrl} detection={player.detection} />
    ) : (
      <div
        className="flex items-center justify-center w-full h-full"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="flex flex-col items-center gap-2">
          <Tv size={32} />
          <span className="text-sm">Loading {channel}...</span>
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-4 w-full px-4 md:px-6 lg:px-8 pt-4 pb-8">
      {layout.offline ? (
        <OfflineLayout
          channel={channel ?? ''}
          strip={
            <PageOfflineStrip
              videos={state.channel.videos}
              folded={layout.folded}
              onShowPlayer={layout.showPlayer}
              live={layout.live}
              onWatchLive={layout.live && playsRecording ? watchLive : undefined}
            />
          }
          player={layout.folded ? null : playerNode}
        >
          <ChannelBody channel={channel} />
        </OfflineLayout>
      ) : (
        <>
          {/* Top row: Player + Chat (resizable, dockable) — stacks on mobile */}
          <ChatDock channel={channel} player={playerNode} />
          <ChannelBody channel={channel} />
        </>
      )}
    </div>
  )
}
