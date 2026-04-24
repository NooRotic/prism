import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { detectURLType, getSourceColor, getURLTypeDisplayName } from '../lib/urlDetection'
import { getDemoById } from '../config/demoContent'
import PlayerHost from '../components/player/PlayerHost'
import DebugPanel from '../components/layout/DebugPanel'

export default function HlsDashPlayerPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const [searchParams] = useSearchParams()
  const { state, dispatch } = useApp()
  const { player } = state

  useEffect(() => {
    // Priority: route param (demo entry) → query param (arbitrary URL)
    let url: string | null = null
    if (streamId) {
      const demo = getDemoById(streamId)
      url = demo ? demo.url : null
    }
    if (!url) {
      url = searchParams.get('url')
    }
    if (!url) return

    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [streamId, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const detection = player.detection
  const accentColor = detection ? getSourceColor(detection) : 'var(--accent-hls)'
  const typeLabel = detection ? getURLTypeDisplayName(detection) : 'HLS/DASH'

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2
          className="text-lg font-bold font-heading uppercase tracking-wider"
          style={{ color: accentColor }}
        >
          {typeLabel} Player
        </h2>
        <span
          className="text-xs truncate font-mono"
          style={{ color: 'var(--text-muted)' }}
          title={player.currentUrl}
        >
          {player.currentUrl}
        </span>
      </div>

      {/* Player */}
      <div
        className="w-full aspect-video rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: '#000',
          border: `2px solid ${accentColor}`,
          boxShadow: `0 0 20px ${accentColor}22`,
        }}
      >
        {player.currentUrl && player.detection ? (
          <PlayerHost url={player.currentUrl} detection={player.detection} />
        ) : (
          <div className="flex items-center justify-center w-full h-full" style={{ color: 'var(--text-muted)' }}>
            <div className="flex flex-col items-center gap-2">
              <Tv size={32} />
              <span className="text-sm">Loading stream...</span>
            </div>
          </div>
        )}
      </div>

      <DebugPanel />
    </div>
  )
}
