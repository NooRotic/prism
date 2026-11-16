import { Heart, Pin } from 'lucide-react'
import type { StreamEntry } from '../../lib/streamsApi'
import ChannelPicture from './ChannelPicture'
import CountryFlag from './CountryFlag'

interface StreamCardProps {
  stream: StreamEntry
  selected: boolean
  onSelect: (id: string) => void
  /** Whether this viewer starred the stream. Leave `onToggleFavorite` out to show no star at all. */
  favorite?: boolean
  /** How many visitors starred it (the server's total); nothing is shown for zero. */
  favoriteCount?: number
  onToggleFavorite?: (id: string) => void
}

/**
 * One stream in the list: its picture (or a letter tile), name, flag, and a mark for a pinned stream or one nobody has
 * checked yet, with a star button and the star total. The name is text, whatever it contains, and the stream's address is
 * never shown: it can carry a token. The star is a second button beside the card's own, not inside it.
 */
export default function StreamCard({ stream, selected, onSelect, favorite = false, favoriteCount = 0, onToggleFavorite }: StreamCardProps) {
  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        onClick={() => onSelect(stream.id)}
        aria-current={selected ? 'true' : undefined}
        title={stream.name}
        className="flex h-full w-full cursor-pointer items-center gap-3.5 rounded-lg border px-3 text-left transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
        style={{
          background: selected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
          borderColor: selected ? 'var(--accent-green)' : 'var(--border)',
        }}
      >
        <ChannelPicture stream={stream} size={64} />
        <span className="min-w-0 flex-1 pr-9">
          <span className="line-clamp-2 break-words text-[1.1rem] leading-snug font-medium" style={{ color: 'var(--text-primary)' }}>
            {stream.name}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <CountryFlag code={stream.country} size={20} />
            {stream.pinned && (
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-gold)' }}>
                <Pin size={14} aria-hidden="true" />
                Pinned
              </span>
            )}
            {stream.state === 'new' && (
              <span className="rounded px-2 py-px" style={{ background: 'var(--border-accent)' }}>
                Unchecked
              </span>
            )}
            {favoriteCount > 0 && (
              <span className="inline-flex items-center gap-1" title={`${favoriteCount} ${favoriteCount === 1 ? 'star' : 'stars'}`}>
                <Heart size={13} aria-hidden="true" />
                <span aria-label={`${favoriteCount} ${favoriteCount === 1 ? 'star' : 'stars'}`}>{favoriteCount}</span>
              </span>
            )}
          </span>
        </span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(stream.id)}
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${stream.name} from favorites` : `Add ${stream.name} to favorites`}
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute top-1.5 right-1.5 cursor-pointer rounded-full p-1.5 hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
          style={{ color: favorite ? 'var(--accent-twitch)' : 'var(--text-muted)' }}
        >
          <Heart size={20} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
