import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useApp, type SearchEntry } from '../../contexts/AppContext'
import {
  detectURLType,
  getSourceColor,
  getURLTypeDisplayName,
} from '../../lib/urlDetection'
import {
  getSearchHistory,
  saveSearchEntry,
} from '../../lib/searchHistory'
import { SearchSuggestions } from './SearchSuggestions'
import { QuickLinks } from './QuickLinks'

function hasUrlChars(text: string): boolean {
  return /[.:/]/.test(text)
}

/** Extract a YouTube video ID from a URL for routing */
function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function SmartUrlInput() {
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const [inputValue, setInputValue] = useState(state.search.query)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync local history from localStorage into app state on mount
  useEffect(() => {
    const stored = getSearchHistory()
    for (const entry of stored) {
      dispatch({ type: 'ADD_HISTORY', entry })
    }
  }, [dispatch])

  // Click-outside detection
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Real-time URL detection
  const detection = useMemo(() => {
    if (!inputValue.trim()) return null
    if (!hasUrlChars(inputValue)) return null
    return detectURLType(inputValue.trim())
  }, [inputValue])

  const borderColor = useMemo(() => {
    if (!detection || detection.type === 'unknown') return 'var(--border)'
    return getSourceColor(detection)
  }, [detection])

  const badgeLabel = useMemo(() => {
    if (!detection || detection.type === 'unknown') return null
    return getURLTypeDisplayName(detection)
  }, [detection])

  // Filtered suggestions for keyboard navigation count
  const filteredHistory = useMemo(() => {
    const history = state.search.history
    if (!inputValue) return history.slice(0, 8)
    return history
      .filter((h) =>
        h.query.toLowerCase().includes(inputValue.toLowerCase()),
      )
      .slice(0, 8)
  }, [state.search.history, inputValue])

  const handleSubmit = useCallback(
    (value?: string) => {
      const query = (value ?? inputValue).trim()
      if (!query) return

      const det = detectURLType(query)

      if (det.type === 'unknown' && !hasUrlChars(query)) {
        if (query.includes(' ')) {
          // Multi-word text without URL chars = category/game name
          dispatch({ type: 'OPEN_CATEGORY_PANEL', category: query })
          setIsOpen(false)
          inputRef.current?.blur()
          return
        }
        // Single word = treat as Twitch channel name → route to /twitch/:channel
        const entry: SearchEntry = { query, type: 'twitch', timestamp: Date.now() }
        saveSearchEntry(entry)
        dispatch({ type: 'ADD_HISTORY', entry })
        dispatch({ type: 'SET_QUERY', query })
        navigate(`/twitch/${query}`)
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        return
      }

      const url = query
      const entry: SearchEntry = { query, type: det.type, timestamp: Date.now() }
      saveSearchEntry(entry)
      dispatch({ type: 'ADD_HISTORY', entry })
      dispatch({ type: 'SET_QUERY', query })

      // Route to the correct protocol page
      if (det.type === 'twitch' && det.metadata?.channelName) {
        navigate(`/twitch/${det.metadata.channelName}`)
      } else if (det.type === 'youtube') {
        const ytId = extractYoutubeId(url)
        navigate(ytId ? `/youtube/${ytId}` : `/youtube/${encodeURIComponent(url)}`)
      } else if (det.type === 'hls' || det.type === 'dash') {
        navigate(`/hls-dash?url=${encodeURIComponent(url)}`)
      } else {
        // Fallback: dispatch PLAY_URL for unknown types (keeps existing behavior)
        dispatch({ type: 'PLAY_URL', url, detection: det })
      }

      setIsOpen(false)
      setSelectedIndex(-1)
      inputRef.current?.blur()
    },
    [inputValue, dispatch, navigate],
  )

  const handleSelectSuggestion = useCallback(
    (entry: SearchEntry) => {
      setInputValue(entry.query)
      handleSubmit(entry.query)
    },
    [handleSubmit],
  )

  const handleQuickLinkSelect = useCallback(
    (gameName: string) => {
      dispatch({ type: 'OPEN_CATEGORY_PANEL', category: gameName })
      setIsOpen(false)
      inputRef.current?.blur()
    },
    [dispatch],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredHistory.length - 1 ? prev + 1 : 0,
        )
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredHistory.length - 1,
        )
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < filteredHistory.length) {
          handleSelectSuggestion(filteredHistory[selectedIndex])
        } else {
          handleSubmit()
        }
      }
    },
    [filteredHistory, selectedIndex, handleSubmit, handleSelectSuggestion],
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    dispatch({ type: 'SET_QUERY', query: '' })
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }, [dispatch])

  const showDropdown =
    isOpen && (state.search.history.length > 0 || !inputValue.trim())

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      {/* Input container */}
      <div
        className="flex items-center gap-2 rounded-lg border bg-[var(--bg-card)] px-3 py-2 transition-colors"
        style={{ borderColor }}
      >
        <Search size={16} className="shrink-0 text-[var(--text-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setSelectedIndex(-1)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Paste URL or type channel name..."
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
        />

        {/* Type badge */}
        {badgeLabel && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: borderColor,
              color: '#000',
            }}
          >
            {badgeLabel}
          </span>
        )}

        {/* Submit button — visible when a valid URL is detected */}
        {badgeLabel && (
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors hover:brightness-110"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: '#000',
            }}
          >
            Go
          </button>
        )}

        {/* Clear button */}
        {inputValue && (
          <button
            onClick={handleClear}
            className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown — brushed-metal surface (Law 9 distinctive material).
          The class adds an inline-SVG turbulence background over the
          base bg-card color so the dropdown reads as a solid textured
          panel instead of a translucent card with content bleeding
          through from underneath. */}
      {showDropdown && (
        <div className="brushed-metal absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-[var(--border)] shadow-lg shadow-black/40">
          {/* Quick links only when input is empty */}
          {!inputValue.trim() && (
            <QuickLinks onSelect={handleQuickLinkSelect} />
          )}

          {/* Divider between sections */}
          {!inputValue.trim() && state.search.history.length > 0 && (
            <div className="mx-3 border-t border-[var(--border)]" />
          )}

          {/* Search suggestions */}
          <SearchSuggestions
            history={state.search.history}
            filterText={inputValue}
            onSelect={handleSelectSuggestion}
            selectedIndex={selectedIndex}
          />
        </div>
      )}
    </div>
  )
}
