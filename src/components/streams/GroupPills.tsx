interface GroupPillsProps {
  groups: string[]
  /** How many streams each group holds (same order as `groups`). */
  counts: number[]
  /** How many streams the search leaves, for the "All streams" pill. */
  total: number
  /** The chosen group's index, or null for all. */
  selected: number | null
  onSelect: (group: number | null) => void
}

const BASE =
  'cursor-pointer rounded-full border px-4 py-1.5 text-[0.95rem] leading-tight transition-colors hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]'
// A pill that is not chosen: the main text colour, a lighter fill than the page and a border that shows against it.
const IDLE = 'border-[var(--text-muted)] bg-[var(--bg-card-hover)] text-[var(--text-primary)]'
// The chosen pill: solid blue with bold black text.
const CHOSEN = 'border-[var(--accent-hls)] bg-[var(--accent-hls)] font-semibold text-black'

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span className={`ml-1.5 font-mono text-[0.85em] ${active ? 'opacity-80' : 'text-[var(--text-secondary)]'}`}>{value}</span>
  )
}

/** The group filter: an "All streams" pill and one pill for each group that has streams, with its count. */
export default function GroupPills({ groups, counts, total, selected, onSelect }: GroupPillsProps) {
  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Filter by group">
      <button type="button" className={`${BASE} ${selected === null ? CHOSEN : IDLE}`} aria-pressed={selected === null} onClick={() => onSelect(null)}>
        All streams <Count value={total} active={selected === null} />
      </button>
      {groups.map((name, index) =>
        counts[index] > 0 || selected === index ? (
          <button
            key={`${index}:${name}`}
            type="button"
            className={`${BASE} ${selected === index ? CHOSEN : IDLE}`}
            aria-pressed={selected === index}
            onClick={() => onSelect(index)}
          >
            {name} <Count value={counts[index]} active={selected === index} />
          </button>
        ) : null,
      )}
    </div>
  )
}
