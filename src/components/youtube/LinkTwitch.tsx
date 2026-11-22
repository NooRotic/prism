import { useMemo, useState } from 'react'
import { PrismMark } from '../brand/PrismMark'
import { useLinkedByYoutube } from '../../hooks/useLinkedAccount'
import { dismissYoutubeSuggestion, isYoutubeSuggestionDismissed } from '../../lib/linkedAccounts'
import { firstTwitchMention } from '../../lib/parseTwitchLink'
import LinkTwitchModal from './LinkTwitchModal'

/**
 * The YouTube page's "Link Twitch" (or "Edit links") button, and, for a channel that is not linked, the Twitch channel the
 * video's own description names, offered as "Possibly twitch.tv/<name>?" (free: the description is already loaded).
 */
export default function LinkTwitch({ channelId, channelTitle, description }: { channelId: string; channelTitle: string; description: string }) {
  const [open, setOpen] = useState(false)
  const [suggested, setSuggested] = useState<string | undefined>(undefined)
  const [dismissedNow, setDismissedNow] = useState<string | null>(null)
  const link = useLinkedByYoutube(channelId)
  const mention = useMemo(() => firstTwitchMention(description), [description])
  const offer = !link && mention && dismissedNow !== channelId && !isYoutubeSuggestionDismissed(channelId) ? mention : null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="prism-pill rounded-full p-[1.5px] inline-flex">
        <button
          type="button"
          onClick={() => {
            setSuggested(undefined)
            setOpen(true)
          }}
          className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-0.5 text-sm font-semibold cursor-pointer"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: 'none' }}
        >
          <PrismMark variant="icon" className="h-5 w-10 shrink-0" />
          {link ? 'Edit links' : 'Link Twitch'}
        </button>
      </span>
      {offer && (
        <span className="inline-flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setSuggested(offer)
              setOpen(true)
            }}
            title="The video description names this Twitch channel. Click to check it and link it."
            className="cursor-pointer underline"
            style={{ color: 'var(--accent-twitch-text)', background: 'none', border: 'none' }}
          >
            {`Possibly twitch.tv/${offer}?`}
          </button>
          <button
            type="button"
            aria-label="Not them"
            title="Not them"
            onClick={() => {
              dismissYoutubeSuggestion(channelId)
              setDismissedNow(channelId)
            }}
            className="cursor-pointer"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
          >
            ×
          </button>
        </span>
      )}
      {open && <LinkTwitchModal channelId={channelId} channelTitle={channelTitle} suggested={suggested} onClose={() => setOpen(false)} />}
    </span>
  )
}
