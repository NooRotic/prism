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

function formatClipDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatVideoDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface CurrentItem {
  title: string
  meta: string[]
}

export default function ProfileSidebar() {
  const { state, dispatch } = useApp()
  const {
    profile,
    channelInfo,
    stream,
    clips,
    videos,
    emotes,
    badges,
    games,
    isLive,
  } = state.channel
  const { detection } = state.player
  const { displayMode } = state

  const gameBoxArt = useMemo(() => {
    if (!channelInfo?.game_id) return null
    const game = games.get(channelInfo.game_id)
    if (!game?.box_art_url) return null
    return game.box_art_url.replace('{width}', '40').replace('{height}', '53')
  }, [channelInfo, games])

  // Derive the currently-playing clip or VOD from the player's detection +
  // the channel data we already have in context. No new state, no action
  // type — any caller of PLAY_URL (cards, SmartUrlInput, etc.) gets this
  // panel for free.
  const currentItem = useMemo<CurrentItem | null>(() => {
    if (!detection) return null

    if (detection.platform === 'twitch-clip' && detection.metadata?.clipId) {
      const clip = clips.find((c) => c.id === detection.metadata!.clipId)
      if (!clip) return null
      const gameName = clip.game_id ? games.get(clip.game_id)?.name : undefined
      return {
        title: clip.title,
        meta: [
          formatClipDuration(clip.duration),
          `${clip.view_count.toLocaleString()} views`,
          clip.creator_name,
          ...(gameName ? [gameName] : []),
        ],
      }
    }

    if (detection.platform === 'twitch-video' && detection.metadata?.videoId) {
      const video = videos.find((v) => v.id === detection.metadata!.videoId)
      if (!video) return null
      return {
        title: video.title,
        meta: [
          video.duration,
          `${video.view_count.toLocaleString()} views`,
          formatVideoDate(video.created_at),
        ],
      }
    }

    return null
  }, [detection, clips, videos, games])

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
          style={{ border: '2px solid var(--accent-green)' }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-xl font-bold truncate"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              {profile.display_name}
            </h2>
            {/* Broadcaster badge keeps purple intentionally — it's the one
                semantic place the Twitch brand color identifies affiliation. */}
            {broadcasterBadge && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
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
              className="text-sm font-medium px-1.5 py-0.5 rounded mt-1 inline-block"
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

      {/* Stream tags — neutral green tint, no purple (reserved for affiliation) */}
      {channelInfo?.tags && channelInfo.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {channelInfo.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(57, 255, 20, 0.08)',
                color: 'var(--accent-green)',
                border: '1px solid rgba(57, 255, 20, 0.2)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Current Video panel — shown when the user selects a clip or VOD.
          Derived live from state.player.detection + state.channel.clips/videos. */}
      {currentItem && (
        <div
          className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md"
          style={{
            backgroundColor: 'var(--bg-card-hover)',
            borderLeft: '2px solid var(--accent-green)',
          }}
        >
          <span
            className="text-[11px] uppercase tracking-wider font-bold"
            style={{ color: 'var(--accent-green)' }}
          >
            Current Video
          </span>
          <p
            className="text-sm font-medium leading-snug line-clamp-2"
            style={{ color: 'var(--text-primary)' }}
            title={currentItem.title}
          >
            {currentItem.title}
          </p>
          <div
            className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {currentItem.meta.map((m, i) => (
              <span key={`${i}-${m}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Current / Last game — clicking opens the in-app Category panel
          with live streams in that category, marking followed channels
          with a Heart badge. Dispatches OPEN_CATEGORY_PANEL and lets
          the CategoryPanel component handle the rest. */}
      {channelInfo?.game_name && (
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'OPEN_CATEGORY_PANEL',
              category: channelInfo.game_name,
            })
          }
          className="group flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors hover:bg-(--border) text-left w-full"
          style={{ backgroundColor: 'var(--bg-card-hover)' }}
          title={`Browse live streams in ${channelInfo.game_name}`}
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
          <div className="min-w-0 flex-1">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {isLive ? 'Playing' : 'Last Played'}
            </span>
            <p
              className="text-base font-medium truncate transition-colors group-hover:text-(--accent-green)"
              style={{ color: 'var(--text-primary)' }}
            >
              {channelInfo.game_name}
            </p>
          </div>
        </button>
      )}

      {/* Emote + Badge counts — both green for visual symmetry */}
      {displayMode === 'streamer' && (
        <div className="grid grid-cols-2 gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-card-hover)' }}
          >
            <Smile size={14} style={{ color: 'var(--accent-green)' }} />
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--accent-green)' }}>
                {emotes.length}
              </p>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Emotes
              </span>
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-card-hover)' }}
          >
            <Shield size={14} style={{ color: 'var(--accent-green)' }} />
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--accent-green)' }}>
                {badges.length}
              </p>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Badge Sets
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bio */}
      {profile.description && (
        <p
          className="text-sm leading-relaxed line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
          title={profile.description}
        >
          {profile.description}
        </p>
      )}

      {/* Account age */}
      <div className="flex items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Joined {formatAccountAge(profile.created_at)} ago
        </span>
      </div>
    </div>
  )
}
