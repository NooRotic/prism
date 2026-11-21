import { useNavigate } from 'react-router-dom'
import type { YouTubeVideo } from '../../lib/youtubeApi'
import { formatCount, formatPublished } from '../../lib/videoFormat'

export function YouTubeVideoCard({ video }: { video: YouTubeVideo }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(`/youtube/${video.id}`)}
      className="group text-left w-full rounded transition-all duration-200 hover:scale-[1.02] cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
      }}
    >
      {/* Thumbnail */}
      <div
        className="w-full aspect-video rounded-t overflow-hidden relative"
        style={{ borderRadius: '4px 4px 0 0' }}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-xs font-mono opacity-40" style={{ color: 'var(--accent-youtube)' }}>
              youtube
            </span>
          </div>
        )}

        {/* View count badge */}
        {video.viewCount && (
          <span
            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: '#fff',
            }}
          >
            {`${formatCount(video.viewCount)} views`}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <span
          data-testid="yt-card-title"
          className="text-sm font-medium line-clamp-2 group-hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          {video.title}
        </span>
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {[video.channelTitle, formatPublished(video.publishedAt)].filter(Boolean).join(' · ')}
        </span>
        <span
          className="text-[10px] font-mono uppercase tracking-wider mt-1"
          style={{ color: 'var(--accent-youtube)', opacity: 0.85 }}
        >
          YouTube
        </span>
      </div>
    </button>
  )
}
