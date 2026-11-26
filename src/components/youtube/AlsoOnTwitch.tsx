import { Link } from 'react-router-dom'
import { useLinkedByYoutube } from '../../hooks/useLinkedAccount'
import { linkName, trackEvent } from '../../lib/analytics'

/**
 * "Also on Twitch" for a YouTube channel the viewer has linked to a Twitch channel (made on the Twitch channel page).
 * It opens that Twitch channel in PRISM. Renders nothing when there is no link.
 */
export default function AlsoOnTwitch({ channelId }: { channelId: string | undefined }) {
  const link = useLinkedByYoutube(channelId)
  if (!link) return null
  return (
    <span className="flex items-center gap-2 text-xs">
      <span style={{ color: 'var(--text-muted)' }}>Also on</span>
      <Link
        to={`/twitch/${link.twitch}`}
        onClick={() => trackEvent('Linking', 'followed', linkName(link))}
        title={`${link.twitch} on Twitch`}
        className="rounded-full px-2.5 py-0.5"
        style={{ background: 'var(--bg-card-hover)', color: 'var(--accent-twitch-text)', border: '1px solid var(--accent-twitch)' }}
      >
        Twitch
      </Link>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {link.confirmed ? '✓ confirmed (both bios link each other)' : 'linked by you'}
      </span>
    </span>
  )
}
