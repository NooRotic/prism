import { useState } from 'react'
import { NO_CATEGORY, compactCount } from '../../lib/dashboardStats'
import type { CategoryRow } from '../../lib/dashboardStats'

interface CategoryRowsProps {
  rows: CategoryRow[]
  /** Open the category (the viewer clicked a row). */
  onOpen: (name: string) => void
}

const VISIBLE_ROWS = 6

/** Category figures among the viewer's live follows, as text rows. */
export default function CategoryRows({ rows, onOpen }: CategoryRowsProps) {
  const [expanded, setExpanded] = useState(false)
  if (rows.length === 0) return null

  const shown = expanded ? rows : rows.slice(0, VISIBLE_ROWS)
  const hidden = rows.length - VISIBLE_ROWS

  return (
    <section aria-label="Categories among your live follows" className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Categories among your live follows
      </h3>
      <div
        className="flex flex-col rounded-md p-2"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {shown.map((row) => {
          const figures = `${row.liveCount} live · ${compactCount(row.viewers)} watching`
          if (row.name === NO_CATEGORY) {
            return (
              <div key={row.name} className="flex justify-between gap-3 px-1 py-1 text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>{row.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{figures}</span>
              </div>
            )
          }
          return (
            <button
              key={row.name}
              type="button"
              onClick={() => onOpen(row.name)}
              aria-label={`${row.name}, ${row.liveCount} live, ${compactCount(row.viewers)} watching`}
              className="flex justify-between gap-3 rounded px-1 py-1 text-left text-xs transition-colors hover:bg-white/5"
            >
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {row.name}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{figures}</span>
            </button>
          )
        })}
        {!expanded && hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded px-1 py-1 text-left text-xs transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            + {hidden} more categories
          </button>
        )}
      </div>
    </section>
  )
}
