import { useState } from 'react'
import { Play, Eye, Clock } from 'lucide-react'
import type { TwitchClip, TwitchGame } from '../../types/twitch'
import { useApp } from '../../contexts/AppContext'
import { detectURLType } from '../../lib/urlDetection'

interface ClipCardProps {
  clip: TwitchClip
  game?: TwitchGame
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ClipCard({ clip, game }: ClipCardProps) {
  const { dispatch } = useApp()
  const [isHovered, setIsHovered] = useState(false)

  const thumbnailUrl = clip.thumbnail_url

  const gameBoxArt = game?.box_art_url
    ? game.box_art_url.replace('{width}', '28').replace('{height}', '38')
    : null

  const handleClick = () => {
    const detection = detectURLType(clip.embed_url)
    dispatch({ type: 'PLAY_URL', url: clip.embed_url, detection })
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex flex-col rounded-lg overflow-hidden text-left transition-all duration-200 shrink-0 w-[280px] md:w-auto"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isHovered ? 'var(--accent-twitch)' : 'var(--border)'}`,
      }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden">
        <img
          src={thumbnailUrl}
          alt={clip.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

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
            style={{ backgroundColor: 'rgba(145, 70, 255, 0.9)' }}
          >
            <Play size={20} fill="white" color="white" />
          </div>
        </div>

        {/* Game box art badge */}
        {gameBoxArt && (
          <img
            src={gameBoxArt}
            alt={game?.name ?? ''}
            className="absolute top-1.5 left-1.5 w-6 h-8 rounded-sm object-cover shadow-md"
            style={{ border: '1px solid rgba(0,0,0,0.3)' }}
          />
        )}

        {/* Duration badge */}
        <span
          className="absolute bottom-1.5 right-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'var(--text-primary)',
          }}
        >
          <Clock size={10} className="inline mr-1 -mt-px" />
          {formatDuration(clip.duration)}
        </span>
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: 'var(--text-primary)' }}
          title={clip.title}
        >
          {clip.title}
        </p>
        <div className="flex items-center justify-between text-[11px]">
          <span style={{ color: 'var(--text-muted)' }} className="truncate">
            {clip.creator_name}
          </span>
          <span
            className="flex items-center gap-1 shrink-0 ml-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Eye size={10} />
            {clip.view_count.toLocaleString()}
          </span>
        </div>
      </div>
    </button>
  )
}
