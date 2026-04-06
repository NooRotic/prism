import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSearchHistory,
  saveSearchEntry,
  removeSearchEntry,
  clearSearchHistory,
} from '../searchHistory'

describe('searchHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array initially', () => {
    expect(getSearchHistory()).toEqual([])
  })

  it('saves and retrieves an entry', () => {
    const entry = { query: 'shroud', type: 'channel', timestamp: Date.now() }
    saveSearchEntry(entry)
    const history = getSearchHistory()
    expect(history).toHaveLength(1)
    expect(history[0].query).toBe('shroud')
  })

  it('deduplicates entries by query, keeping the newest', () => {
    saveSearchEntry({ query: 'shroud', type: 'channel', timestamp: 1000 })
    saveSearchEntry({ query: 'shroud', type: 'channel', timestamp: 2000 })
    const history = getSearchHistory()
    expect(history).toHaveLength(1)
    expect(history[0].timestamp).toBe(2000)
  })

  it('trims entries beyond 20', () => {
    for (let i = 0; i < 25; i++) {
      saveSearchEntry({ query: `query_${i}`, type: 'channel', timestamp: i })
    }
    const history = getSearchHistory()
    expect(history).toHaveLength(20)
    // Most recent should be first
    expect(history[0].query).toBe('query_24')
  })

  it('removes an entry by query', () => {
    saveSearchEntry({ query: 'shroud', type: 'channel', timestamp: 1000 })
    saveSearchEntry({ query: 'ninja', type: 'channel', timestamp: 2000 })
    removeSearchEntry('shroud')
    const history = getSearchHistory()
    expect(history).toHaveLength(1)
    expect(history[0].query).toBe('ninja')
  })

  it('clears all entries', () => {
    saveSearchEntry({ query: 'shroud', type: 'channel', timestamp: 1000 })
    saveSearchEntry({ query: 'ninja', type: 'channel', timestamp: 2000 })
    clearSearchHistory()
    expect(getSearchHistory()).toEqual([])
  })

  it('persists via localStorage key glaze_search_history', () => {
    saveSearchEntry({ query: 'test', type: 'channel', timestamp: 1000 })
    const raw = localStorage.getItem('glaze_search_history')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].query).toBe('test')
  })
})
