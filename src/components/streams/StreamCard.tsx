import { Pin } from 'lucide-react'
import type { StreamEntry } from '../../lib/streamsApi'
import ChannelPicture from './ChannelPicture'
import CountryFlag from './CountryFlag'

interface StreamCardProps {
  stream: StreamEntry
  selected: boolean
  onSelect: (id: string) => void
}

/**
 * One stream in the list: its picture (or a letter tile), name, flag, and a mark for a pinned stream or one nobody has
 * checked yet. The name is text, whatever it contains, and the stream's address is never shown: it can carry a token.
 */
export default function StreamCard({ stream, selected, onSelect }: StreamCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(stream.id)}
      aria-current={selected ? 'true' : undefined}
      title={stream.name}
      className="flex h-full w-full cursor-pointer items-center gap-3 rounded-lg border px-2.5 text-left transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
      style={{
        background: selected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        borderColor: selected ? 'var(--accent-green)' : 'var(--border)',
      }}
    >
      <ChannelPicture stream={stream} size={52} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[0.95rem] leading-snug font-medium" style={{ color: 'var(--text-primary)' }}>
          {stream.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <CountryFlag code={stream.country} size={16} />
          {stream.pinned && (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-gold)' }}>
              <Pin size={12} aria-hidden="true" />
              Pinned
            </span>
          )}
          {stream.state === 'new' && (
            <span className="rounded px-1.5 py-px" style={{ background: 'var(--border-accent)' }}>
              Unchecked
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
