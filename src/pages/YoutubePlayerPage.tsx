import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { detectURLType } from '../lib/urlDetection'
import { getDemoById } from '../config/demoContent'
import { getVideoDetails, isYouTubeApiAvailable, type YouTubeVideo } from '../lib/youtubeApi'
import PlayerHost from '../components/player/PlayerHost'
import DebugPanel from '../components/layout/DebugPanel'

export default function YoutubePlayerPage() {
  const { videoId } = useParams<{ videoId: string }>()
  const { state, dispatch } = useApp()
  const { player } = state
  const [videoMeta, setVideoMeta] = useState<YouTubeVideo | null>(null)

  // Set player URL from route param
  useEffect(() => {
    if (!videoId) return
    const demo = getDemoById(videoId)
    const url = demo ? demo.url : `https://www.youtube.com/watch?v=${videoId}`
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch video metadata for title/channel display
  useEffect(() => {
    if (!videoId || !isYouTubeApiAvailable()) return
    let cancelled = false
    getVideoDetails([videoId])
      .then((vids) => {
        if (!cancelled && vids.length > 0) setVideoMeta(vids[0])
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[YoutubePlayerPage] failed to fetch video metadata:', err)
        }
      })
    return () => { cancelled = true }
  }, [videoId])

  const title = videoMeta?.title ?? 'YouTube Player'
  const channelName = videoMeta?.channelTitle

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h2
            className="text-lg font-bold font-heading uppercase tracking-wider"
            style={{ color: 'var(--accent-youtube)' }}
          >
            {videoMeta ? 'Now Playing' : 'YouTube Player'}
          </h2>
          {channelName && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              {channelName}
            </span>
          )}
        </div>
        {videoMeta && (
          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {title}
          </p>
        )}
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

      {/* Video description */}
      {videoMeta?.description && (
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
            {videoMeta.description}
          </p>
        </div>
      )}

      <DebugPanel />
    </div>
  )
}
