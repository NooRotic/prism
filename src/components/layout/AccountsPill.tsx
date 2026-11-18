import { UserRound } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { useYoutubeAccount } from '../../hooks/useYoutubeAccount'

interface AccountsPillProps {
  expanded: boolean
  onPress(trigger: HTMLElement): void
}

/**
 * Who the viewer is, per platform, at a glance: the Twitch picture once signed in, the picture of the YouTube account
 * the subscriptions came from. It opens the Accounts row (in the header's flow: a drop-down here would cover the top
 * corner of a playing Twitch video and pause it).
 */
export function AccountsPill({ expanded, onPress }: AccountsPillProps) {
  const { isAuthenticated } = useTwitchAuth()
  const { state } = useApp()
  const youtube = useYoutubeAccount()
  const user = isAuthenticated ? state.auth.user : null
  const twitchPicture = user?.profile_image_url || ''
  const youtubePicture = youtube.account?.thumbnailUrl || ''

  const twitchLabel = isAuthenticated ? (user?.display_name ? `signed in as ${user.display_name}` : 'signed in') : 'not signed in'
  const youtubeLabel = youtube.imported ? 'subscriptions imported' : 'not imported'
  const nothingConnected = !isAuthenticated && !youtube.imported

  return (
    <button
      type="button"
      aria-label={`Accounts: Twitch ${twitchLabel}, YouTube ${youtubeLabel}`}
      aria-expanded={expanded}
      aria-controls="header-row"
      onClick={(e) => onPress(e.currentTarget)}
      className="flex h-8 shrink-0 items-center gap-1 rounded-full py-1 pr-1.5 pl-1 transition-colors duration-150 hover:bg-white/5 sm:pr-2"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${expanded ? 'var(--text-secondary)' : 'var(--border-accent)'}`,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
      }}
    >
      {/* With nothing connected, a phone has no room for two empty dots and "Sign in" (measured 2026-11-18): below
          440 px a person icon stands in for both. */}
      <span data-accounts-badges className={`flex items-center ${nothingConnected ? 'max-[439px]:hidden' : ''}`} aria-hidden="true">
        <Badge picture={twitchPicture} on={isAuthenticated} color="var(--accent-twitch)" glyph="" />
        <span className="-ml-1">
          <Badge picture={youtubePicture} on={youtube.imported} color="var(--accent-youtube)" glyph="▶" />
        </span>
      </span>
      {nothingConnected && (
        <>
          <span className="max-[439px]:hidden">Sign in</span>
          <span data-accounts-icon className="flex min-[440px]:hidden" aria-hidden="true">
            <UserRound size={16} />
          </span>
        </>
      )}
    </button>
  )
}

function Badge({ picture, on, color, glyph }: { picture: string; on: boolean; color: string; glyph: string }) {
  const ring = { boxShadow: `0 0 0 2px var(--bg), 0 0 0 3px ${on ? color : 'var(--border-accent)'}` }
  if (on && picture) {
    return <img src={picture} alt="" className="h-5 w-5 rounded-full object-cover" style={ring} />
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white"
      style={{ ...ring, backgroundColor: on ? color : 'var(--border)', color: on ? '#fff' : 'var(--text-muted)' }}
    >
      {glyph}
    </span>
  )
}
