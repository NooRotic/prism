import { useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useChannelData } from '../hooks/useChannelData'
import { useTwitchAuth } from '../hooks/useTwitchAuth'
import { detectURLType } from '../lib/urlDetection'
import PlayerHost from '../components/player/PlayerHost'
import ProfileSidebar from '../components/channel/ProfileSidebar'
import StatsRow from '../components/channel/StatsRow'
import ClipGrid from '../components/channel/ClipGrid'
import VODGrid from '../components/channel/VODGrid'
import DebugPanel from '../components/layout/DebugPanel'

export default function TwitchPlayerPage() {
  const { channel } = useParams<{ channel: string }>()
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated } = useTwitchAuth()
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

  // Set player URL from route param
  useEffect(() => {
    if (!channel) return
    const url = `https://twitch.tv/${channel}`
    const detection = detectURLType(url)
    // Only dispatch if the URL actually changed
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [channel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top on channel change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [channel])

  return (
    <div className="flex flex-col gap-4 w-full px-4 md:px-6 lg:px-8 pt-4 pb-8">
      {/* Top row: Player + ProfileSidebar */}
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-[1600px] mx-auto">
        <div
          className="w-full md:w-[70%] aspect-video rounded-lg"
          style={{
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
        <div className="w-full md:w-[30%]">
          <ProfileSidebar />
        </div>
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
