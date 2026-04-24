import type { DemoEntry } from '../../config/demoContent'
import { DemoCard } from './DemoCard'

interface DemoGridProps {
  entries: DemoEntry[]
  /** Grid columns on desktop — protocol pages use 3, hub uses asymmetric */
  columns?: number
}

export function DemoGrid({ entries, columns = 3 }: DemoGridProps) {
  if (entries.length === 0) return null

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, entries.length)}, minmax(0, 1fr))`,
      }}
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={entry.featured ? { gridColumn: 'span 1' } : undefined}
        >
          <DemoCard entry={entry} />
        </div>
      ))}
    </div>
  )
}
