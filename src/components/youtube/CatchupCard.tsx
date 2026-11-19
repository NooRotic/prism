import { Link } from 'react-router-dom'
import { formatDuration, LANE_LABEL, type CatchupVideo } from '../../lib/catchup'

/** One video in the Catch up queue. The whole card opens it in PRISM's YouTube player. */
export default function CatchupCard({ video, href }: { video: CatchupVideo; href?: string }) {
  return (
    <Link
      to={href ?? `/youtube/${video.id}?from=catchup`}
      className="flex flex-col rounded-lg overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="relative aspect-video" style={{ backgroundColor: '#000' }}>
        {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />}
        <span
          className="absolute bottom-1 right-1 rounded px-1 text-xs font-mono"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff' }}
        >
          {formatDuration(video.durationSec)}
        </span>
        {video.tag && (
          <span
            title={LANE_LABEL[video.tag]}
            className="absolute top-1 left-1 rounded px-1.5 text-xs font-mono font-bold"
            style={{ backgroundColor: 'var(--accent-youtube)', color: '#fff' }}
          >
            {video.tag}
          </span>
        )}
      </div>
      <div className="p-2 flex flex-col gap-0.5">
        <span className="text-sm line-clamp-2" style={{ color: 'var(--text-primary)' }}>
          {video.title}
        </span>
        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {video.channel}
        </span>
      </div>
    </Link>
  )
}
