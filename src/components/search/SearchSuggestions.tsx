import { Clock } from 'lucide-react'
import type { SearchEntry } from '../../contexts/AppContext'
import { detectURLType, getSourceColor, getURLTypeDisplayName } from '../../lib/urlDetection'

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface SearchSuggestionsProps {
  history: SearchEntry[]
  filterText: string
  onSelect: (entry: SearchEntry) => void
  selectedIndex: number
}

export function SearchSuggestions({
  history,
  filterText,
  onSelect,
  selectedIndex,
}: SearchSuggestionsProps) {
  const filtered = filterText
    ? history.filter((h) =>
        h.query.toLowerCase().includes(filterText.toLowerCase()),
      )
    : history

  const suggestions = filtered.slice(0, 8)

  if (suggestions.length === 0) return null

  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <Clock size={12} className="text-[var(--text-muted)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Recent
        </span>
      </div>
      {suggestions.map((entry, index) => {
        const detection = detectURLType(entry.query)
        const color = getSourceColor(detection)
        const displayName =
          entry.type !== 'unknown'
            ? getURLTypeDisplayName(detection)
            : detection.type !== 'unknown'
              ? getURLTypeDisplayName(detection)
              : 'Channel'

        return (
          <button
            key={`${entry.query}-${entry.timestamp}`}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors"
            style={{
              backgroundColor:
                index === selectedIndex
                  ? 'var(--bg-card-hover)'
                  : 'transparent',
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(entry)
            }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
              {entry.query}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
              {displayName}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
              {formatRelativeTime(entry.timestamp)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
