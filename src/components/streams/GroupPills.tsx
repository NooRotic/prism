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

/** The group filter: an "All streams" pill and one pill for each group that has streams, with its count. */
export default function GroupPills({ groups, counts, total, selected, onSelect }: GroupPillsProps) {
  const pill = (active: boolean) => ({
    background: active ? 'var(--accent-hls)' : 'var(--bg-card)',
    borderColor: active ? 'var(--accent-hls)' : 'var(--border-accent)',
    color: active ? '#000' : 'var(--text-secondary)',
  })
  const className =
    'cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]'

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by group">
      <button type="button" className={className} style={pill(selected === null)} aria-pressed={selected === null} onClick={() => onSelect(null)}>
        All streams <span className="ml-1 opacity-75">{total}</span>
      </button>
      {groups.map((name, index) =>
        counts[index] > 0 || selected === index ? (
          <button
            key={`${index}:${name}`}
            type="button"
            className={className}
            style={pill(selected === index)}
            aria-pressed={selected === index}
            onClick={() => onSelect(index)}
          >
            {name} <span className="ml-1 opacity-75">{counts[index]}</span>
          </button>
        ) : null,
      )}
    </div>
  )
}
