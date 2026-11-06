import type { ReactNode } from 'react'
import RailEntryCard from './RailEntryCard'
import type { RailEntry } from './types'

interface RailSectionProps {
  label: string
  icon: ReactNode
  entries: RailEntry[]
  expanded: boolean
}

/**
 * One labelled group of rail entries. It shows every entry it is given: the rail scrolls,
 * so there is no cap (a fixed handful of avatars used to hide the rest behind a "+N").
 *
 * Deliberately knows nothing about where its entries came from — it takes a
 * label, an icon, and a list. That is what makes a second platform additive:
 * append a section, touch no existing code.
 */
export default function RailSection({ label, icon, entries, expanded }: RailSectionProps) {
  if (entries.length === 0) return null

  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <header className="flex items-center gap-2 px-2 py-1">
        {icon}
        {expanded && (
          <span
            className="text-xs font-semibold uppercase"
            style={{
              // text-secondary, not text-muted: these are the rail's only
              // structural labels, and muted at 12px on a translucent dark
              // panel was too faint to scan.
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
            }}
          >
            {label}
          </span>
        )}
      </header>

      {entries.map((entry) => (
        <RailEntryCard key={entry.id} entry={entry} expanded={expanded} />
      ))}
    </section>
  )
}
