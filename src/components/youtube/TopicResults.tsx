import { Link } from 'react-router-dom'
import type { YouTubeSearchResult } from '../../lib/youtubeApi'

/** The video cards a topic search returns. Shared by the topic buttons and the related-videos fallback. */
export default function TopicResults({ videos, columns }: { videos: YouTubeSearchResult[]; columns: string }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {videos.map((v) => (
        <Link
          key={v.id}
          to={`/youtube/${v.id}`}
          className="flex flex-col rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="aspect-video" style={{ backgroundColor: '#000' }}>
            {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />}
          </div>
          <div className="p-2 flex flex-col gap-0.5">
            <span className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>
              {v.title}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {v.channelTitle}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
