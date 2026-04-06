import { useMemo } from 'react'
import { Eye, Calendar, Gamepad2, Smile, Shield } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'

function formatAccountAge(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const years = now.getFullYear() - created.getFullYear()
  const months = now.getMonth() - created.getMonth()
  const totalMonths = years * 12 + months
  if (totalMonths >= 12) {
    const y = Math.floor(totalMonths / 12)
    const m = totalMonths % 12
    return m > 0 ? `${y}y ${m}mo` : `${y}y`
  }
  return `${totalMonths}mo`
}

export default function ProfileSidebar() {
  const { state } = useApp()
  const { profile, channelInfo, stream, emotes, badges, games, isLive } = state.channel
  const { displayMode } = state

  const gameBoxArt = useMemo(() => {
    if (!channelInfo?.game_id) return null
    const game = games.get(channelInfo.game_id)
    if (!game?.box_art_url) return null
    return game.box_art_url.replace('{width}', '40').replace('{height}', '53')
  }, [channelInfo, games])

  if (!profile) return null

  const broadcasterBadge = profile.broadcaster_type
    ? profile.broadcaster_type.toUpperCase()
    : null

  return (
    <div
      className="flex flex-col gap-4 p-4 rounded-lg h-full overflow-y-auto"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Avatar + Name + Badge */}
      <div className="flex items-center gap-3">
        <img
          src={profile.profile_image_url}
          alt={profile.display_name}
          className="w-14 h-14 rounded-full shrink-0"
          style={{ border: '2px solid var(--accent-twitch)' }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-lg font-bold truncate"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              {profile.display_name}
            </h2>
            {broadcasterBadge && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                style={{
                  backgroundColor: 'rgba(145, 70, 255, 0.2)',
                  color: 'var(--accent-twitch)',
                }}
              >
                {broadcasterBadge}
              </span>
            )}
          </div>
          {displayMode === 'chatter' && (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded mt-1 inline-block"
              style={{
                backgroundColor: 'rgba(57, 255, 20, 0.15)',
                color: 'var(--accent-green)',
              }}
            >
              Chatter
            </span>
          )}
        </div>
      </div>

      {/* Live indicator */}
      {isLive && stream && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-400">LIVE</span>
          <div className="flex items-center gap-1 ml-auto">
            <Eye size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {stream.viewer_count.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Stream tags */}
      {channelInfo?.tags && channelInfo.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {channelInfo.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(145, 70, 255, 0.1)',
                color: 'var(--accent-twitch)',
                border: '1px solid rgba(145, 70, 255, 0.2)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Current / Last game */}
      {channelInfo?.game_name && (
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-md"
          style={{ backgroundColor: 'var(--bg-card-hover)' }}
        >
          {gameBoxArt ? (
            <img
              src={gameBoxArt}
              alt={channelInfo.game_name}
              className="w-8 h-10 rounded object-cover shrink-0"
            />
          ) : (
            <Gamepad2 size={16} style={{ color: 'var(--text-muted)' }} />
          )}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {isLive ? 'Playing' : 'Last Played'}
            </span>
            <p
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {channelInfo.game_name}
            </p>
          </div>
        </div>
      )}

      {/* Emote + Badge counts */}
      {displayMode === 'streamer' && (
        <div className="grid grid-cols-2 gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-card-hover)' }}
          >
            <Smile size={14} style={{ color: 'var(--accent-green)' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                {emotes.length}
              </p>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Emotes
              </span>
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-card-hover)' }}
          >
            <Shield size={14} style={{ color: 'var(--accent-twitch)' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--accent-twitch)' }}>
                {badges.length}
              </p>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Badge Sets
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bio */}
      {profile.description && (
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
          title={profile.description}
        >
          {profile.description}
        </p>
      )}

      {/* Account age */}
      <div className="flex items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Joined {formatAccountAge(profile.created_at)} ago
        </span>
      </div>
    </div>
  )
}
