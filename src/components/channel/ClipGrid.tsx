import { useMemo } from 'react'
import { Film } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import ClipCard from './ClipCard'

export default function ClipGrid() {
  const { state } = useApp()
  const { clips, games } = state.channel

  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => b.view_count - a.view_count),
    [clips],
  )

  if (sortedClips.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Film size={16} style={{ color: 'var(--accent-twitch)' }} />
        <h3
          className="text-sm font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          Top Clips
        </h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ({sortedClips.length})
        </span>
      </div>

      {/* Scrollable row on mobile, grid on wider screens */}
      <div className="flex md:grid md:grid-cols-2 xl:grid-cols-3 gap-3 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-thin">
        {sortedClips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            game={games.get(clip.game_id)}
          />
        ))}
      </div>
    </div>
  )
}
