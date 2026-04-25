import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import type { EnrichedFollow } from '../../hooks/useFollowedChannels'

interface FollowedChannelCardProps {
  follow: EnrichedFollow
}

export default function FollowedChannelCard({ follow }: FollowedChannelCardProps) {
  const { dispatch } = useApp()
  const navigate = useNavigate()

  const handleClick = useCallback(() => {
    // Navigate to the channel route so the entire page updates
    // (player, sidebar, stats, clips, VODs — all driven by route param)
    navigate(`/twitch/${follow.broadcaster_login}`)
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch, navigate, follow.broadcaster_login])

  const thumbnail =
    follow.isLive && follow.thumbnailUrl
      ? follow.thumbnailUrl.replace('{width}', '320').replace('{height}', '180')
      : null

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex flex-col rounded-lg text-left transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${follow.isLive ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`,
      }}
      aria-label={`Open ${follow.broadcaster_name}${follow.isLive ? ' (live)' : ''}`}
    >
      {/* Thumbnail area — stream preview for live channels, muted placeholder otherwise */}
      <div
        className="relative aspect-video w-full rounded-t-lg"
        style={{
          backgroundColor: 'var(--bg-card-hover)',
          overflow: 'hidden',
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={follow.streamTitle ?? follow.broadcaster_name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Offline
          </div>
        )}

        {/* Live badge + viewer count */}
        {follow.isLive && (
          <>
            <span
              className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.9)',
                color: '#fff',
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              Live
            </span>
            {typeof follow.viewerCount === 'number' && (
              <span
                className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: '#fff',
                }}
              >
                <Eye size={12} />
                {follow.viewerCount.toLocaleString()}
              </span>
            )}
          </>
        )}
      </div>

      {/* Text block */}
      <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0">
        <p
          className="text-base font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
          title={follow.broadcaster_name}
        >
          {follow.broadcaster_name}
        </p>
        {follow.isLive ? (
          <p
            className="text-xs truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={follow.streamTitle}
          >
            {follow.gameName ? `${follow.gameName} · ` : ''}
            {follow.streamTitle ?? ''}
          </p>
        ) : (
          <p
            className="text-xs truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            Offline
          </p>
        )}
      </div>
    </button>
  )
}
