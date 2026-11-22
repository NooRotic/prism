import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PrismMark } from '../brand/PrismMark'
import { useLinkedAccount } from '../../hooks/useLinkedAccount'
import { useLinkSuggestion } from '../../hooks/useLinkSuggestion'
import LinkAccountsModal from './LinkAccountsModal'

/** PRISM's "latest from <channel>" search for a linked YouTube channel. */
const youtubeHref = (yt: { title: string; handle?: string }) => `/youtube?${new URLSearchParams({ q: `latest ${yt.handle?.replace(/^@/, '') || yt.title}` })}`

const chipStyle = { background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }

/** "Also on YouTube / Kick" for a Twitch channel, and the button that opens the "Link accounts" modal. */
export default function LinkedAccounts({ login, description }: { login: string; description: string }) {
  const [open, setOpen] = useState(false)
  const link = useLinkedAccount(login)
  const suggestion = useLinkSuggestion(login, description)

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* A PRISM feature, so it is drawn like one: the line-art prism and a spectrum outline (which moves on hover),
            not muted text that reads as part of the bio. */}
        <span className="prism-pill rounded-full p-[1.5px] inline-flex">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-0.5 text-sm font-semibold cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: 'none' }}
          >
            <PrismMark variant="icon" className="h-5 w-10 shrink-0" />
            {link ? 'Edit links' : 'Link accounts'}
          </button>
        </span>
        {/* A YouTube channel with the same name as this Twitch channel: offered, never assumed. Opens the modal with it filled in, so the usual check runs. */}
        {!link && suggestion.status === 'suggest' && suggestion.channel && (
          <span className="inline-flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="A YouTube channel with the same name. Click to check it and link it."
              className="cursor-pointer underline"
              style={{ color: 'var(--accent-youtube)', background: 'none', border: 'none' }}
            >
              Possibly &quot;{suggestion.channel.handle || suggestion.channel.title}&quot;?
            </button>
            <button type="button" aria-label="Not them" title="Not them" onClick={suggestion.dismiss} className="cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
              ×
            </button>
          </span>
        )}
      </div>
      {open && <LinkAccountsModal login={login} description={description} suggested={suggestion.channel?.handle || suggestion.channel?.title} onClose={() => setOpen(false)} />}
    </div>
  )
}
