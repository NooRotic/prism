/** The YouTube grid's recent searches, in this browser only. Never throws: blocked storage just means no history. */
import { STORAGE_KEYS } from '../config/storageKeys'
import { normaliseQuery } from './videoPageApi'

export const MAX_HISTORY = 10

export function getSearchHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_YOUTUBE_SEARCH_HISTORY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function save(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_YOUTUBE_SEARCH_HISTORY, JSON.stringify(list))
  } catch {
    /* storage unavailable: not remembered */
  }
}

/** Remembers a search at the front of the list. The same search in other words (case, spacing, punctuation) replaces the old entry. */
export function addSearch(text: string): void {
  const shown = text.trim().replace(/\s+/g, ' ')
  const key = normaliseQuery(shown)
  if (!key) return
  save([shown, ...getSearchHistory().filter((h) => normaliseQuery(h) !== key)].slice(0, MAX_HISTORY))
}

export function clearSearchHistory(): void {
  save([])
}
