import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { YouTubeVideo } from '../youtubeApi'
import type { CachedYouTubeResults } from '../youtubeCache'
import {
  getCachedResults,
  setCachedResults,
  appendCachedPage,
  invalidateCache,
  invalidateAllCache,
  isCacheExpired,
} from '../youtubeCache'

const CACHE_PREFIX = 'prism_yt_cache_'
const TTL_MS = 24 * 60 * 60 * 1000

const sampleVideo: YouTubeVideo = {
  id: 'abc',
  title: 'Test',
  channelTitle: 'Channel',
  thumbnail: 'http://t/',
  publishedAt: '2026-01-01',
  description: '',
}

function makeFixture(overrides: Partial<CachedYouTubeResults> = {}): CachedYouTubeResults {
  return {
    videos: [sampleVideo],
    nextPageToken: 'token-1',
    timestamp: Date.now(),
    query: 'test query',
    ...overrides,
  }
}

describe('youtubeCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // getCachedResults
  // ---------------------------------------------------------------------------

  describe('getCachedResults', () => {
    it('returns null when key is not present', () => {
      expect(getCachedResults('popular')).toBeNull()
    })

    it('returns cached data when fresh', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))

      const fixture = makeFixture({ timestamp: Date.now() })
      localStorage.setItem(`${CACHE_PREFIX}popular`, JSON.stringify(fixture))

      const result = getCachedResults('popular')
      expect(result).not.toBeNull()
      expect(result!.query).toBe('test query')
      expect(result!.videos).toHaveLength(1)
    })

    it('returns null when cache is older than 24 hours', () => {
      vi.useFakeTimers()
      const now = new Date('2026-05-06T12:00:00Z').getTime()
      vi.setSystemTime(now - TTL_MS - 1000) // set time 24h+1s in the past
      const fixture = makeFixture({ timestamp: Date.now() })
      localStorage.setItem(`${CACHE_PREFIX}popular`, JSON.stringify(fixture))

      vi.setSystemTime(now) // advance to "now"
      expect(getCachedResults('popular')).toBeNull()
    })

    it('returns null at exactly the 24h boundary (TTL is >=)', () => {
      vi.useFakeTimers()
      const now = new Date('2026-05-06T12:00:00Z').getTime()
      vi.setSystemTime(now - TTL_MS) // exactly 24h ago
      const fixture = makeFixture({ timestamp: Date.now() })
      localStorage.setItem(`${CACHE_PREFIX}popular`, JSON.stringify(fixture))

      vi.setSystemTime(now)
      expect(getCachedResults('popular')).toBeNull()
    })

    it('returns null when localStorage contains corrupt JSON', () => {
      localStorage.setItem(`${CACHE_PREFIX}x`, 'not-json')
      expect(getCachedResults('x')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // setCachedResults
  // ---------------------------------------------------------------------------

  describe('setCachedResults', () => {
    it('writes data to the correct key', () => {
      const fixture = makeFixture()
      setCachedResults('gaming', fixture)
      expect(localStorage.getItem(`${CACHE_PREFIX}gaming`)).not.toBeNull()
    })

    it('writes serialized JSON that getCachedResults can read back', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))

      const fixture = makeFixture({ timestamp: Date.now() })
      setCachedResults('gaming', fixture)

      const result = getCachedResults('gaming')
      expect(result).not.toBeNull()
      expect(result!.nextPageToken).toBe('token-1')
      expect(result!.videos[0].id).toBe('abc')
    })

    it('does not throw when localStorage throws QuotaExceededError', () => {
      const err = new DOMException('quota', 'QuotaExceededError')
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw err
      })
      expect(() => setCachedResults('gaming', makeFixture())).not.toThrow()
      spy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // appendCachedPage
  // ---------------------------------------------------------------------------

  describe('appendCachedPage', () => {
    it('appends new videos to an existing cache entry', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))

      const fixture = makeFixture({ timestamp: Date.now() })
      setCachedResults('gaming', fixture)

      const extra: YouTubeVideo = { ...sampleVideo, id: 'xyz', title: 'Extra' }
      appendCachedPage('gaming', [extra], 'token-2')

      const result = getCachedResults('gaming')
      expect(result).not.toBeNull()
      expect(result!.videos).toHaveLength(2)
      expect(result!.videos[1].id).toBe('xyz')
    })

    it('updates nextPageToken in the existing cache entry', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))

      const fixture = makeFixture({ timestamp: Date.now(), nextPageToken: 'token-1' })
      setCachedResults('gaming', fixture)

      appendCachedPage('gaming', [], 'token-2')

      const result = getCachedResults('gaming')
      expect(result!.nextPageToken).toBe('token-2')
    })

    it('is a no-op when there is no existing cache entry', () => {
      appendCachedPage('nonexistent', [sampleVideo], 'token-1')
      expect(localStorage.getItem(`${CACHE_PREFIX}nonexistent`)).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // invalidateCache
  // ---------------------------------------------------------------------------

  describe('invalidateCache', () => {
    it('removes the specific category key', () => {
      localStorage.setItem(`${CACHE_PREFIX}gaming`, JSON.stringify(makeFixture()))
      invalidateCache('gaming')
      expect(localStorage.getItem(`${CACHE_PREFIX}gaming`)).toBeNull()
    })

    it('does not touch other category cache keys', () => {
      localStorage.setItem(`${CACHE_PREFIX}gaming`, JSON.stringify(makeFixture()))
      localStorage.setItem(`${CACHE_PREFIX}music`, JSON.stringify(makeFixture()))
      invalidateCache('gaming')
      expect(localStorage.getItem(`${CACHE_PREFIX}music`)).not.toBeNull()
    })

    it('does not touch non-cache keys', () => {
      localStorage.setItem('other_key', 'x')
      localStorage.setItem(`${CACHE_PREFIX}gaming`, JSON.stringify(makeFixture()))
      invalidateCache('gaming')
      expect(localStorage.getItem('other_key')).toBe('x')
    })
  })

  // ---------------------------------------------------------------------------
  // invalidateAllCache
  // ---------------------------------------------------------------------------

  describe('invalidateAllCache', () => {
    it('removes all prism_yt_cache_* keys', () => {
      localStorage.setItem(`${CACHE_PREFIX}gaming`, JSON.stringify(makeFixture()))
      localStorage.setItem(`${CACHE_PREFIX}music`, JSON.stringify(makeFixture()))
      localStorage.setItem(`${CACHE_PREFIX}sports`, JSON.stringify(makeFixture()))
      invalidateAllCache()
      expect(localStorage.getItem(`${CACHE_PREFIX}gaming`)).toBeNull()
      expect(localStorage.getItem(`${CACHE_PREFIX}music`)).toBeNull()
      expect(localStorage.getItem(`${CACHE_PREFIX}sports`)).toBeNull()
    })

    it('does not remove non-cache keys', () => {
      localStorage.setItem('prism_panel_ratio', '0.7')
      localStorage.setItem('twitch_access_token', 'tok-abc')
      localStorage.setItem(`${CACHE_PREFIX}gaming`, JSON.stringify(makeFixture()))
      invalidateAllCache()
      expect(localStorage.getItem('prism_panel_ratio')).toBe('0.7')
      expect(localStorage.getItem('twitch_access_token')).toBe('tok-abc')
    })

    it('does not throw when there are 0 cache entries', () => {
      localStorage.setItem('prism_panel_ratio', '0.7')
      expect(() => invalidateAllCache()).not.toThrow()
    })

    it('removes multiple cache entries in one call', () => {
      for (let i = 0; i < 5; i++) {
        localStorage.setItem(`${CACHE_PREFIX}cat_${i}`, JSON.stringify(makeFixture()))
      }
      invalidateAllCache()
      for (let i = 0; i < 5; i++) {
        expect(localStorage.getItem(`${CACHE_PREFIX}cat_${i}`)).toBeNull()
      }
    })
  })

  // ---------------------------------------------------------------------------
  // isCacheExpired
  // ---------------------------------------------------------------------------

  describe('isCacheExpired', () => {
    it('returns true when the key is not present', () => {
      expect(isCacheExpired('popular')).toBe(true)
    })

    it('returns false when a fresh cache entry exists', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))

      const fixture = makeFixture({ timestamp: Date.now() })
      localStorage.setItem(`${CACHE_PREFIX}popular`, JSON.stringify(fixture))

      expect(isCacheExpired('popular')).toBe(false)
    })

    it('returns true when cache is older than 24 hours', () => {
      vi.useFakeTimers()
      const now = new Date('2026-05-06T12:00:00Z').getTime()
      vi.setSystemTime(now - TTL_MS - 1000)
      const fixture = makeFixture({ timestamp: Date.now() })
      localStorage.setItem(`${CACHE_PREFIX}popular`, JSON.stringify(fixture))

      vi.setSystemTime(now)
      expect(isCacheExpired('popular')).toBe(true)
    })

    it('returns true when localStorage contains corrupt JSON', () => {
      localStorage.setItem(`${CACHE_PREFIX}corrupt`, 'bad-json!!!')
      expect(isCacheExpired('corrupt')).toBe(true)
    })
  })
})
