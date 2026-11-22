import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { useLinkedAccount } from '../../hooks/useLinkedAccount'
import LinkAccountsModal from './LinkAccountsModal'

/** PRISM's "latest from <channel>" search for a linked YouTube channel. */
const youtubeHref = (yt: { title: string; handle?: string }) => `/youtube?${new URLSearchParams({ q: `latest ${yt.handle?.replace(/^@/, '') || yt.title}` })}`

const chipStyle = { background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }

/** "Also on YouTube / Kick" for a Twitch channel, and the button that opens the "Link accounts" modal. */
export default function LinkedAccounts({ login, description }: { login: string; description: string }) {
  const [open, setOpen] = useState(false)
  const link = useLinkedAccount(login)

  return (
    <div className="flex flex-col gap-2">
      {link && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Also on
          </span>
          {link.youtube && (
            <>
              <Link to={youtubeHref(link.youtube)} title={`${link.youtube.title} on YouTube`} className="rounded-full px-2.5 py-0.5 text-xs" style={{ ...chipStyle, borderColor: 'var(--accent-youtube)' }}>
                YouTube
              </Link>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {link.confirmed ? '✓ confirmed (both bios link each other)' : 'linked by you'}
              </span>
            </>
          )}
          {link.kick && (
            <a href={`https://kick.com/${link.kick.slug}`} target="_blank" rel="noopener noreferrer" title={`${link.kick.slug} on Kick`} className="rounded-full px-2.5 py-0.5 text-xs" style={chipStyle}>
              Kick
            </a>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start text-xs cursor-pointer"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
      >
        <Link2 size={12} />
        {link ? 'Edit links' : 'Link accounts'}
      </button>
      {open && <LinkAccountsModal login={login} description={description} onClose={() => setOpen(false)} />}
    </div>
  )
}
