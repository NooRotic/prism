import { DASHBOARD_BG, ensureContrast } from '../../lib/contrast'
import { compactCount } from '../../lib/dashboardStats'
import type { TwitchUser } from '../../types/twitch'

interface IdentityStripProps {
  user: TwitchUser
  /** The viewer's chat name colour as `#RRGGBB`, or null when unknown. */
  chatColor: string | null
  /** Follows loaded so far. */
  following: number
  /** True while more follows are still to be loaded, which makes `following` a floor. */
  followingMore: boolean
  liveCount: number
  watching: number
}

/**
 * The top of the dashboard: who is signed in, and a one-line total of their live follows.
 * On a phone the totals stack under the name; from `md` up they sit on the right.
 */
export default function IdentityStrip({
  user,
  chatColor,
  following,
  followingMore,
  liveCount,
  watching,
}: IdentityStripProps) {
  const nameColour = (chatColor && ensureContrast(chatColor, DASHBOARD_BG)) || 'var(--text-primary)'
  const followingText = `${following}${followingMore ? '+' : ''}`
  const badge = user.broadcaster_type ? user.broadcaster_type.toUpperCase() : null
  const since = new Date(user.created_at).getUTCFullYear()

  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md p-3 md:flex-row md:items-center md:gap-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex min-w-0 max-w-full items-center gap-3">
        {user.profile_image_url ? (
          <img
            src={user.profile_image_url}
            alt={`${user.display_name} profile picture`}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            style={{ border: `2px solid ${nameColour}` }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
            style={{ backgroundColor: 'var(--bg-card-hover)', border: `2px solid ${nameColour}`, color: nameColour }}
          >
            {user.display_name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <b className="truncate text-base" style={{ color: nameColour }}>
              {user.display_name}
            </b>
            {badge && (
              <span
                className="shrink-0 rounded px-1.5 py-px text-[9px] tracking-wider"
                style={{ backgroundColor: 'rgba(145, 70, 255, 0.2)', color: '#d4bcff' }}
              >
                {badge}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>{`following ${followingText}`}</span>
            {!Number.isNaN(since) && <span>{`account since ${since}`}</span>}
          </div>
        </div>
      </div>

      <div
        className="flex flex-col text-left text-xs md:ml-auto md:text-right"
        style={{ color: 'var(--text-secondary)' }}
      >
        <b className="text-base" style={{ color: 'var(--text-primary)' }}>{`${liveCount} live of ${followingText}`}</b>
        <span>{`${compactCount(watching)} watching right now`}</span>
      </div>
    </div>
  )
}
