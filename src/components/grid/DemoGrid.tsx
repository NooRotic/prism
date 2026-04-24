import type { DemoEntry } from '../../config/demoContent'
import { DemoCard } from './DemoCard'

interface DemoGridProps {
  entries: DemoEntry[]
  /** Grid columns on desktop — protocol pages use 3, hub uses asymmetric */
  columns?: number
}

export function DemoGrid({ entries, columns = 3 }: DemoGridProps) {
  if (entries.length === 0) return null

  // Responsive: 1 col mobile, 2 col tablet, `columns` on desktop
  const colClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={`grid gap-4 ${colClass}`}>
      {entries.map((entry) => (
        <DemoCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
