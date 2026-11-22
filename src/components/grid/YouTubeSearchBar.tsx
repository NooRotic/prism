import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

interface YouTubeSearchBarProps {
  onSearch: (text: string) => void
  /** The search the page is showing (from the address); the box follows it, so Back and recent searches fill the box. */
  query?: string
  /** Earlier searches, newest first. */
  recent?: string[]
  onClearRecent?: () => void
}

/** The grid's search box: Enter or the button submits. Earlier searches sit under it as buttons. */
export function YouTubeSearchBar({ onSearch, query = '', recent = [], onClearRecent }: YouTubeSearchBarProps) {
  const [text, setText] = useState(query)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the box shows the search the address holds
  useEffect(() => setText(query), [query])
  return (
    <div className="flex flex-col gap-2">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onSearch(text)
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Search YouTube"
          placeholder={'Search YouTube, or try "latest MrBeast video"'}
          className="flex-1 min-w-0 rounded px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent-youtube)', color: '#fff', border: 'none' }}
        >
          <Search size={14} />
          Search
        </button>
      </form>
      {recent.length > 0 && (
        <div role="group" aria-label="Recent searches" className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Recent
          </span>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSearch(r)}
              className="rounded-full px-2.5 py-0.5 text-xs cursor-pointer max-w-[14rem] truncate"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={onClearRecent}
            className="text-xs cursor-pointer"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
