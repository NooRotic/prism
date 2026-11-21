import { useState } from 'react'
import { Search } from 'lucide-react'

/** The grid's search box: Enter or the button submits. */
export function YouTubeSearchBar({ onSearch }: { onSearch: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
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
  )
}
