import { useState } from 'react'
import { Play, Eye, Calendar } from 'lucide-react'
import type { TwitchVideo } from '../../types/twitch'
import { useApp } from '../../contexts/AppContext'
import { detectURLType } from '../../lib/urlDetection'

interface VideoCardProps {
  video: TwitchVideo
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(duration: string): string {
  // Twitch duration format: "1h2m3s"
  const h = duration.match(/(\d+)h/)?.[1]
  const m = duration.match(/(\d+)m/)?.[1]
  const s = duration.match(/(\d+)s/)?.[1]

  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s && !h) parts.push(`${s}s`)
  return parts.join(' ') || duration
}

export default function VideoCard({ video }: VideoCardProps) {
  const { dispatch } = useApp()
  const [isHovered, setIsHovered] = useState(false)

  const thumbnailUrl = video.thumbnail_url
    ? video.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180')
        .replace('{width}', '320').replace('{height}', '180')
    : ''

  const handleClick = () => {
    const detection = detectURLType(video.url)
    dispatch({ type: 'PLAY_URL', url: video.url, detection })
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex flex-col rounded-lg overflow-hidden text-left transition-all duration-200 shrink-0 w-[280px] md:w-auto"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isHovered ? 'var(--accent-green)' : 'var(--border)'}`,
      }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-card-hover)' }}
          >
            <Play size={24} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            opacity: isHovered ? 1 : 0,
          }}
        >
          <div
            className="p-2.5 rounded-full"
            style={{ backgroundColor: 'rgba(57, 255, 20, 0.9)' }}
          >
            <Play size={20} fill="black" color="black" />
          </div>
        </div>

        {/* Duration badge */}
        <span
          className="absolute bottom-1.5 right-1.5 text-xs font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'var(--text-primary)',
          }}
        >
          {formatDuration(video.duration)}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 min-w-0">
        <p
          className="text-base font-medium truncate"
          style={{ color: 'var(--text-primary)' }}
          title={video.title}
        >
          {video.title}
        </p>
        <div className="flex items-center justify-between text-xs">
          <span
            className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Eye size={12} />
            {video.view_count.toLocaleString()}
          </span>
          <span
            className="flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Calendar size={12} />
            {formatDate(video.created_at)}
          </span>
        </div>
      </div>
    </button>
  )
}
