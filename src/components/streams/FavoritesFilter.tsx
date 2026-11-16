import { Heart } from 'lucide-react'

interface FavoritesFilterProps {
  active: boolean
  /** How many streams this viewer starred. */
  count: number
  onToggle: () => void
}

/** A switch above the stream list: show only the streams this viewer starred. Nothing is hidden for good; it is a view. */
export default function FavoritesFilter({ active, count, onToggle }: FavoritesFilterProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
      style={{
        background: active ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        borderColor: active ? 'var(--accent-twitch)' : 'var(--border-accent)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      <Heart size={15} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
      Favorites
      <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        {count}
      </span>
    </button>
  )
}
