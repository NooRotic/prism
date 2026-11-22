import { useMemo, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useChannelUploads } from '../../hooks/useChannelUploads'
import { useLinkedAccount } from '../../hooks/useLinkedAccount'
import { filterBySource, flagLikelyDuplicates, twitchToItem, youtubeToItem, type Source } from '../../lib/combinedVods'
import { SORT_LABELS, sortVideos, type SortOrder } from '../../lib/sortVideos'
import CombinedVodCard from './CombinedVodCard'

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
      {/* A confirmed link gets the moving PRISM spectrum as a 3px border with a glow; the button sits inside it. A link the
          viewer made gets a plain 2px outline. */}
      <div
        data-testid="prism-spectrum"
        className={`rounded-xl ${confirmed ? 'prism-spectrum p-[3px]' : 'p-[2px]'}`}
        style={confirmed ? undefined : { background: 'var(--border)' }}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-3 rounded-[9px] px-5 py-4 cursor-pointer text-left ${confirmed ? 'prism-tint' : ''}`}
          style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: 'none' }}
        >
          <span className="flex items-center gap-3 min-w-0">
            {confirmed && (
              <span
                data-testid="prism-badge"
                className="prism-spectrum flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-widest"
                style={{ color: '#000', boxShadow: 'none' }}
              >
                <Sparkles size={13} />
                PRISM
              </span>
            )}
            <span className="flex flex-col min-w-0">
              <span className="text-base font-extrabold">Twitch + YouTube videos, together</span>
              <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {confirmed ? '✓ confirmed: both bios link each other' : 'linked by you'} · {link.youtube.title}
              </span>
            </span>
          </span>
          <ChevronDown size={22} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
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

          {/* Columns at least 17.5rem (280px) wide: about 1.75 times narrower than the three-up grid this replaced, so the thumbnails are too. */}
          <div data-testid="combined-grid" className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-3">
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
