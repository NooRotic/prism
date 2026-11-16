import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { getFavorites, isFavorite, resetFavoritesCache, setFavorite, subscribeFavorites } from '../favorites'

const KEY = STORAGE_KEYS.LOCAL_FAVORITE_STREAMS

beforeEach(() => {
  localStorage.clear()
  resetFavoritesCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('favorites', () => {
  it('starts empty', () => {
    expect(getFavorites().size).toBe(0)
    expect(isFavorite('aaaaaaaaaaaa')).toBe(false)
  })

  it('stars and un-stars, and saves the ids in local storage', () => {
    expect(setFavorite('aaaaaaaaaaaa', true)).toBe(true)
    expect(setFavorite('bbbbbbbbbbbb', true)).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])

    expect(setFavorite('aaaaaaaaaaaa', false)).toBe(true)

    expect(isFavorite('aaaaaaaaaaaa')).toBe(false)
    expect(isFavorite('bbbbbbbbbbbb')).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['bbbbbbbbbbbb'])
  })

  it('removes the saved key when the last star goes', () => {
    setFavorite('aaaaaaaaaaaa', true)
    setFavorite('aaaaaaaaaaaa', false)

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('reports no change for a state the stream already has, so nothing is counted twice', () => {
    expect(setFavorite('aaaaaaaaaaaa', false)).toBe(false)
    setFavorite('aaaaaaaaaaaa', true)

    expect(setFavorite('aaaaaaaaaaaa', true)).toBe(false)
  })

  it('refuses an id that is not a short id', () => {
    expect(setFavorite('', true)).toBe(false)
    expect(setFavorite('has space', true)).toBe(false)
    expect(setFavorite('x'.repeat(65), true)).toBe(false)
    expect(getFavorites().size).toBe(0)
  })

  it('reads what an earlier visit saved', () => {
    localStorage.setItem(KEY, JSON.stringify(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']))
    resetFavoritesCache()

    expect([...getFavorites()]).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })

  it('ignores a saved value that is not a list of ids', () => {
    for (const bad of ['not json', '{"a":1}', '5', '[1,2]', '["has space"]']) {
      localStorage.setItem(KEY, bad)
      resetFavoritesCache()
      expect(getFavorites().size, bad).toBe(0)
    }
  })

  it('keeps the good ids from a mixed list', () => {
    localStorage.setItem(KEY, JSON.stringify(['aaaaaaaaaaaa', 5, 'has space', 'bbbbbbbbbbbb']))
    resetFavoritesCache()

    expect([...getFavorites()]).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })

  it('stops at 1000 stars', () => {
    for (let i = 0; i < 1000; i++) expect(setFavorite(`id${i}`, true)).toBe(true)

    expect(setFavorite('onetoomany', true)).toBe(false)
    expect(getFavorites().size).toBe(1000)
    expect(setFavorite('id0', false)).toBe(true)
  })

  it('hands out the same set until a star changes (it is a store snapshot)', () => {
    const before = getFavorites()
    expect(getFavorites()).toBe(before)

    setFavorite('aaaaaaaaaaaa', true)

    expect(getFavorites()).not.toBe(before)
  })

  it('tells listeners about a change, and stops once they unsubscribe', () => {
    const listener = vi.fn()
    const stop = subscribeFavorites(listener)

    setFavorite('aaaaaaaaaaaa', true)
    expect(listener).toHaveBeenCalledTimes(1)

    stop()
    setFavorite('bbbbbbbbbbbb', true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows another tab that changed the stars', () => {
    const listener = vi.fn()
    const stop = subscribeFavorites(listener)
    localStorage.setItem(KEY, JSON.stringify(['cccccccccccc']))

    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))

    expect([...getFavorites()]).toEqual(['cccccccccccc'])
    expect(listener).toHaveBeenCalled()
    stop()
  })

  it('works, for this page only, when local storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    resetFavoritesCache()

    expect(getFavorites().size).toBe(0)
    expect(setFavorite('aaaaaaaaaaaa', true)).toBe(true)
    expect(isFavorite('aaaaaaaaaaaa')).toBe(true)
  })
})
