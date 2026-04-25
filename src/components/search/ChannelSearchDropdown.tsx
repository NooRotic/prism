import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Radio } from 'lucide-react'
import { searchChannels } from '../../lib/twitchApi'
import type { TwitchChannel } from '../../types/twitch'

/** Search results include extra fields not in the base TwitchChannel type */
interface SearchResult extends TwitchChannel {
  is_live: boolean
  thumbnail_url: string
}

interface ChannelSearchDropdownProps {
  open: boolean
  onClose: () => void
}

export default function ChannelSearchDropdown({ open, onClose }: ChannelSearchDropdownProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  // Focus input when opened
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [open])

  // Click-outside dismissal
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const data = await searchChannels(q, 8) as SearchResult[]
      setResults(data)
      setSelectedIndex(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }, [doSearch])

  const selectChannel = useCallback((login: string) => {
    navigate(`/twitch/${login}`)
    onClose()
  }, [navigate, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        selectChannel(results[selectedIndex].broadcaster_login)
      } else if (query.trim().length > 0) {
        // Plain enter with no selection — treat as channel name
        selectChannel(query.trim())
      }
    }
  }, [results, selectedIndex, selectChannel, onClose, query])

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="absolute top-full mt-1 right-0 z-50 w-80 rounded-lg overflow-hidden shadow-lg shadow-black/40"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Search input */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search Twitch channels..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]) }}
            className="p-0.5 rounded hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>
              Searching...
            </span>
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="py-6 text-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No channels found
            </span>
          </div>
        )}

        {!loading && results.map((ch, i) => (
          <button
            key={ch.broadcaster_id}
            type="button"
            onClick={() => selectChannel(ch.broadcaster_login)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
            style={{
              backgroundColor: i === selectedIndex ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}
          >
            {/* Thumbnail */}
            {ch.thumbnail_url ? (
              <img
                src={ch.thumbnail_url.replace('{width}', '50').replace('{height}', '50')}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
                style={{ border: `1px solid ${ch.is_live ? 'rgba(239, 68, 68, 0.6)' : 'var(--border)'}` }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}
              >
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {ch.broadcaster_name[0]}
                </span>
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {ch.broadcaster_name}
                </span>
                {ch.is_live && (
                  <Radio size={10} style={{ color: '#ef4444' }} />
                )}
              </div>
              <span className="text-xs truncate block" style={{ color: 'var(--text-muted)' }}>
                {ch.game_name || 'Offline'}
              </span>
            </div>

            {/* Live badge */}
            {ch.is_live && (
              <span
                className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
              >
                LIVE
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Hint */}
      {query.length < 2 && !loading && (
        <div className="py-4 text-center">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Type at least 2 characters to search
          </span>
        </div>
      )}
    </div>
  )
}
