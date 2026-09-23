import type { ReactNode } from 'react'
import RailEntryCard from './RailEntryCard'
import type { RailEntry } from './types'

/**
 * Fixed maximum entries per section — not a measured viewport fit.
 *
 * Measuring needs a resize observer and a layout pass that can flicker on
 * load; two sections competing for measured space needs an allocation rule
 * that is arbitrary either way; and a stable, predictable number of avatars
 * is easier to build muscle memory against. If 8 proves wrong in use, this
 * is the one constant to change.
 */
export const RAIL_SECTION_CAP = 8

interface RailSectionProps {
  label: string
  icon: ReactNode
  entries: RailEntry[]
  expanded: boolean
  /**
   * Total available, when the caller has more than it passed in `entries`
   * (the follows section passes its live subset but knows the full count).
   * Defaults to `entries.length`.
   */
  totalCount?: number
  /** Invoked by the `+N` control. Opens the Following panel. */
  onOverflowClick?: () => void
}

/**
 * One labelled group of rail entries.
 *
 * Deliberately knows nothing about where its entries came from — it takes a
 * label, an icon, and a list. That is what makes a second platform additive:
 * append a section, touch no existing code.
 */
export default function RailSection({
  label,
  icon,
  entries,
  expanded,
  totalCount,
  onOverflowClick,
}: RailSectionProps) {
  if (entries.length === 0) return null

  const visible = entries.slice(0, RAIL_SECTION_CAP)
  const hidden = Math.max(0, (totalCount ?? entries.length) - RAIL_SECTION_CAP)

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

      {visible.map((entry) => (
        <RailEntryCard key={entry.id} entry={entry} expanded={expanded} />
      ))}

      {hidden > 0 && onOverflowClick && (
        <button
          type="button"
          onClick={onOverflowClick}
          className="mx-2 rounded-md px-2 py-1 text-xs transition-colors duration-150 hover:bg-white/5"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          +{hidden}
        </button>
      )}
    </section>
  )
}
