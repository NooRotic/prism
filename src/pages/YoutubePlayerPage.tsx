import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { detectURLType } from '../lib/urlDetection'
import { getDemoById } from '../config/demoContent'
import PlayerHost from '../components/player/PlayerHost'
import DebugPanel from '../components/layout/DebugPanel'

export default function YoutubePlayerPage() {
  const { videoId } = useParams<{ videoId: string }>()
  const { state, dispatch } = useApp()
  const { player } = state

  useEffect(() => {
    if (!videoId) return
    // Check if it's a demo entry ID first
    const demo = getDemoById(videoId)
    const url = demo ? demo.url : `https://www.youtube.com/watch?v=${videoId}`
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2
          className="text-lg font-bold font-heading uppercase tracking-wider"
          style={{ color: 'var(--accent-youtube)' }}
        >
          YouTube Player
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
          border: '2px solid var(--accent-youtube)',
          boxShadow: '0 0 20px rgba(255, 0, 0, 0.1)',
        }}
      >
        {player.currentUrl && player.detection ? (
          <PlayerHost url={player.currentUrl} detection={player.detection} />
        ) : (
          <div className="flex items-center justify-center w-full h-full" style={{ color: 'var(--text-muted)' }}>
            <div className="flex flex-col items-center gap-2">
              <Tv size={32} />
              <span className="text-sm">Loading video...</span>
            </div>
          </div>
        )}
      </div>

      <DebugPanel />
    </div>
  )
}
