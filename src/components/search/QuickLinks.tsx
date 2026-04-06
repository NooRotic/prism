import { useEffect, useState } from 'react'
import { getTopGames } from '../../lib/twitchApi'
import type { TwitchGame } from '../../types/twitch'

interface QuickLinksProps {
  onSelect: (gameName: string) => void
}

export function QuickLinks({ onSelect }: QuickLinksProps) {
  const [games, setGames] = useState<TwitchGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getTopGames(12)
      .then((data) => {
        if (!cancelled) setGames(data)
      })
      .catch(() => {
        // silently fail
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="px-3 py-2">
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Top Categories
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-20 animate-pulse rounded-full bg-[var(--border)]"
            />
          ))}
        </div>
      </div>
    )
  }

  if (games.length === 0) return null

  return (
    <div className="px-3 py-2">
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Top Categories
      </span>
      <div className="flex flex-wrap gap-1.5">
        {games.map((game) => {
          const artUrl = game.box_art_url
            .replace('{width}', '16')
            .replace('{height}', '16')

          return (
            <button
              key={game.id}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-twitch)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(game.name)
              }}
            >
              <img
                src={artUrl}
                alt=""
                width={16}
                height={16}
                className="rounded-sm"
              />
              <span className="max-w-[120px] truncate">{game.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
