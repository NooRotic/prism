import { useEffect, useCallback, useMemo, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useChannelData } from '../hooks/useChannelData'
import { useTwitchAuth } from '../hooks/useTwitchAuth'
import { detectURLType } from '../lib/urlDetection'
import PlayerHost from '../components/player/PlayerHost'
import TwitchChatEmbed from '../components/channel/TwitchChatEmbed'
import ProfileSidebar from '../components/channel/ProfileSidebar'
import StatsRow from '../components/channel/StatsRow'
import ClipGrid from '../components/channel/ClipGrid'
import VODGrid from '../components/channel/VODGrid'
import DebugPanel from '../components/layout/DebugPanel'
import { ResizableHandle } from '../components/layout/ResizableHandle'

const PANEL_RATIO_KEY = 'prism_panel_ratio'
const DEFAULT_RATIO = 0.8 // 80% player, 20% chat
const MIN_RATIO = 0.5
const MAX_RATIO = 0.92

function loadRatio(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_RATIO
  const stored = localStorage.getItem(PANEL_RATIO_KEY)
  if (!stored) return DEFAULT_RATIO
  const val = parseFloat(stored)
  if (isNaN(val) || val < MIN_RATIO || val > MAX_RATIO) return DEFAULT_RATIO
  return val
}

export default function TwitchPlayerPage() {
  const { channel } = useParams<{ channel: string }>()
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated } = useTwitchAuth()
  const { player } = state

  // Resizable panel state
  const [playerRatio, setPlayerRatio] = useState(loadRatio)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleResize = useCallback((deltaX: number) => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    if (containerWidth === 0) return
    setPlayerRatio((prev) => {
      const next = prev + deltaX / containerWidth
      return Math.min(MAX_RATIO, Math.max(MIN_RATIO, next))
    })
  }, [])

  const handleResizeEnd = useCallback(() => {
    setPlayerRatio((current) => {
      localStorage.setItem(PANEL_RATIO_KEY, current.toFixed(3))
      return current
    })
  }, [])

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

  // Set player URL from route param
  useEffect(() => {
    if (!channel) return
    const url = `https://twitch.tv/${channel}`
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [channel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top on channel change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [channel])

  const playerPercent = `${(playerRatio * 100).toFixed(1)}%`
  const chatPercent = `${((1 - playerRatio) * 100).toFixed(1)}%`

  return (
    <div className="flex flex-col gap-4 w-full px-4 md:px-6 lg:px-8 pt-4 pb-8">
      {/* Top row: Player + Chat (resizable) — stacks on mobile */}
      <div
        ref={containerRef}
        className="flex flex-col md:flex-row w-full max-w-[1600px] mx-auto"
        style={{ minHeight: '360px' }}
      >
        {/* Player */}
        <div
          className="w-full md:flex-none relative overflow-hidden rounded-lg"
          style={{
            width: undefined,
            flex: `0 0 ${playerPercent}`,
            aspectRatio: '16 / 9',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          {player.currentUrl && player.detection ? (
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
          )}
        </div>

        {/* Resize handle — hidden on mobile */}
        <div className="hidden md:flex">
          <ResizableHandle onResize={handleResize} onResizeEnd={handleResizeEnd} />
        </div>

        {/* Chat */}
        <div
          className="w-full md:flex-none rounded-lg overflow-hidden"
          style={{
            flex: `0 0 ${chatPercent}`,
            minHeight: '300px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          {channel ? (
            <TwitchChatEmbed channel={channel} />
          ) : (
            <div
              className="flex items-center justify-center w-full h-full"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="text-sm">No channel</span>
            </div>
          )}
        </div>
      </div>

      {/* Profile sidebar — full width below player+chat */}
      <div className="max-w-[1600px] mx-auto w-full">
        <ProfileSidebar />
      </div>

      {/* Stats row */}
      <div className="max-w-[1600px] mx-auto w-full">
        <StatsRow />
      </div>

      {/* Debug panel */}
      <div className="max-w-[1600px] mx-auto w-full">
        <DebugPanel />
      </div>

      {/* Bottom row: Clips + VODs */}
      <div className="flex flex-col lg:flex-row gap-4 w-full max-w-[1600px] mx-auto">
        <div className="w-full lg:w-1/2">
          <ClipGrid />
        </div>
        <div className="w-full lg:w-1/2">
          <VODGrid />
        </div>
      </div>
    </div>
  )
}
