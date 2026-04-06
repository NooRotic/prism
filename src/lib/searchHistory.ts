const STORAGE_KEY = 'glaze_search_history'
const MAX_ENTRIES = 20

export interface SearchHistoryEntry {
  query: string
  type: string
  timestamp: number
}

export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SearchHistoryEntry[]
  } catch {
    return []
  }
}

export function saveSearchEntry(entry: SearchHistoryEntry): void {
  const history = getSearchHistory()
  const deduped = history.filter((h) => h.query !== entry.query)
  const updated = [entry, ...deduped].slice(0, MAX_ENTRIES)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function removeSearchEntry(query: string): void {
  const history = getSearchHistory()
  const updated = history.filter((h) => h.query !== query)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function clearSearchHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
