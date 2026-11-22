import { beforeEach, describe, expect, it } from 'vitest'
import { addSearch, clearSearchHistory, getSearchHistory, MAX_HISTORY } from '../youtubeSearchHistory'

beforeEach(() => localStorage.clear())

describe('searchHistory', () => {
  it('starts empty', () => expect(getSearchHistory()).toEqual([]))

  it('remembers searches, newest first', () => {
    addSearch('minecraft speedrun')
    addSearch('latest MrBeast video')
    expect(getSearchHistory()).toEqual(['latest MrBeast video', 'minecraft speedrun'])
  })

  it('moves a repeated search to the front instead of listing it twice, ignoring case, spacing and punctuation', () => {
    addSearch('Minecraft Speedrun')
    addSearch('lofi')
    addSearch('  minecraft   speedrun! ')
    expect(getSearchHistory()).toEqual(['minecraft speedrun!', 'lofi'])
  })

  it('keeps only the most recent ones', () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) addSearch(`query ${i}`)
    const h = getSearchHistory()
    expect(h).toHaveLength(MAX_HISTORY)
    expect(h[0]).toBe(`query ${MAX_HISTORY + 4}`)
  })

  it('ignores empty text and text with no letters or numbers', () => {
    addSearch('   ')
    addSearch('?!')
    expect(getSearchHistory()).toEqual([])
  })

  it('can be cleared', () => {
    addSearch('lofi')
    clearSearchHistory()
    expect(getSearchHistory()).toEqual([])
  })

  it('reads damaged storage as empty', () => {
    localStorage.setItem('prism_youtube_search_history', '{"x":1}')
    expect(getSearchHistory()).toEqual([])
    localStorage.setItem('prism_youtube_search_history', JSON.stringify(['ok', 3, null, 'fine']))
    expect(getSearchHistory()).toEqual(['ok', 'fine'])
  })
})
