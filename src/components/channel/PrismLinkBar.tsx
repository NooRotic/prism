import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useChannelUploads } from '../../hooks/useChannelUploads'
import { useLinkedAccount } from '../../hooks/useLinkedAccount'
import { filterBySource, flagLikelyDuplicates, twitchToItem, youtubeToItem, type Source } from '../../lib/combinedVods'
import { SORT_LABELS, sortVideos, type SortOrder } from '../../lib/sortVideos'
import CombinedVodCard from './CombinedVodCard'

/** The spectrum: neither Twitch purple nor YouTube red, so it reads as PRISM's own. */
const SPECTRUM = 'linear-gradient(90deg, #ff4d4d, #ffa64d, #ffe14d, #4dff88, #4dc3ff, #9a6bff, #ff4dd2)'

const SOURCES: Array<{ key: Source; label: string }> = [
  { key: 'all', label: 'Both' },
  { key: 'twitch', label: 'Twitch only' },
  { key: 'youtube', label: 'YouTube only' },
]

const pill = (active: boolean) => ({
  background: active ? 'var(--text-primary)' : 'var(--bg-card)',
  color: active ? 'var(--bg)' : 'var(--text-secondary)',
  border: '1px solid var(--border)',
})

/**
 * Under a linked creator's profile: a bar that opens one list of their Twitch VODs and YouTube videos together. A
 * link both bios agree on gets the PRISM spectrum; a link the viewer made gets a plain outline. Nothing is read from
 * YouTube until the bar is opened. The Twitch VODs are the ones the page already holds.
 */
export default function PrismLinkBar({ login }: { login: string }) {
  const { state } = useApp()
  const link = useLinkedAccount(login)
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<Source>('all')
  const [order, setOrder] = useState<SortOrder>('newest')
  const uploads = useChannelUploads(link?.youtube?.channelId, open)

  const twitchVideos = state.channel.videos
  const items = useMemo(() => {
    const merged = flagLikelyDuplicates([...twitchVideos.map(twitchToItem), ...uploads.videos.map(youtubeToItem)])
    return sortVideos(filterBySource(merged, source), order)
  }, [twitchVideos, uploads.videos, source, order])

  if (!link?.youtube) return null
  const confirmed = link.confirmed

  return (
    <div className="max-w-[1600px] mx-auto w-full flex flex-col gap-3" data-testid="prism-bar" data-confirmed={String(confirmed)}>
      {/* The spectrum is the border: a gradient behind the button, which sits 2px in from it. */}
      <div className="rounded-lg p-[2px]" style={{ background: confirmed ? SPECTRUM : 'var(--border)' }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-[6px] px-4 py-2.5 cursor-pointer text-left"
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: 'none' }}
        >
          <span className="flex flex-col">
            <span className="text-sm font-bold">Twitch + YouTube videos, together</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {confirmed ? '✓ confirmed: both bios link each other' : 'linked by you'} · {link.youtube.title}
            </span>
          </span>
          <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show" className="flex gap-2">
              {SOURCES.map((s) => (
                <button key={s.key} type="button" aria-pressed={source === s.key} onClick={() => setSource(s.key)} className="rounded px-2.5 py-1 text-sm cursor-pointer" style={pill(source === s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Sort by" className="flex gap-2">
              {(Object.keys(SORT_LABELS) as SortOrder[]).map((k) => (
                <button key={k} type="button" aria-pressed={order === k} onClick={() => setOrder(k)} className="rounded px-2.5 py-1 text-sm cursor-pointer" style={pill(order === k)}>
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <p data-testid="combined-count" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {twitchVideos.length.toLocaleString()} Twitch + {uploads.videos.length.toLocaleString()} YouTube videos loaded
            {uploads.status === 'loading' ? ' (reading YouTube…)' : ''}
          </p>
          {uploads.status === 'error' && (
            <p role="alert" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Could not reach YouTube, so only the Twitch videos are shown.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <CombinedVodCard key={`${item.platform}:${item.id}`} item={item} />
            ))}
          </div>

          {uploads.hasMore && (
            <button
              type="button"
              disabled={uploads.loadingMore}
              onClick={() => void uploads.loadMore()}
              className="self-start rounded px-3 py-1.5 text-sm cursor-pointer disabled:opacity-60"
              style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {uploads.loadingMore ? 'Loading…' : 'Load more YouTube videos'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
