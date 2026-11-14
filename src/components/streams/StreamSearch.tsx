import { Search } from 'lucide-react'

interface StreamSearchProps {
  value: string
  onChange: (text: string) => void
}

/** The search box above the stream list: plain text, matched against names as words, ignoring case and accents. */
export default function StreamSearch({ value, onChange }: StreamSearchProps) {
  return (
    <div className="relative">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        style={{ color: 'var(--text-muted)' }}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search streams"
        placeholder="Search streams by name"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border py-2 pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}
