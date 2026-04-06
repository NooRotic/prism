import { useMemo } from 'react'
import { Video } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import VideoCard from './VideoCard'

export default function VODGrid() {
  const { state } = useApp()
  const { videos } = state.channel

  const sortedVideos = useMemo(
    () =>
      [...videos].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [videos],
  )

  if (sortedVideos.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Video size={16} style={{ color: 'var(--accent-green)' }} />
        <h3
          className="text-sm font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          Recent VODs
        </h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ({sortedVideos.length})
        </span>
      </div>

      {/* Scrollable row on mobile, grid on wider screens */}
      <div className="flex md:grid md:grid-cols-2 xl:grid-cols-3 gap-3 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-thin">
        {sortedVideos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </div>
  )
}
