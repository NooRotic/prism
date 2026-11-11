import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import type { TwitchVideo } from '../../types/twitch'
import {
  OFFLINE_CHAT_WIDTH_DEFAULT,
  clampChatWidth,
  formatAgo,
  lastStreamedAt,
  loadChatWidth,
  storeChatWidth,
} from '../offlineLayout'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function video(over: Partial<TwitchVideo>): TwitchVideo {
  return {
    id: 'v',
    type: 'archive',
    created_at: '2026-11-01T10:00:00Z',
    duration: '1h0m0s',
    ...over,
  } as TwitchVideo
}

describe('clampChatWidth', () => {
  it('raises a width below the minimum to 280', () => {
    expect(clampChatWidth(200, 1400)).toBe(280)
  })
  it('caps a width at 560', () => {
    expect(clampChatWidth(900, 1400)).toBe(560)
  })
  it('caps a width at half the container when that is smaller than 560', () => {
    expect(clampChatWidth(700, 800)).toBe(400)
  })
  it('never goes below 280, even in a container narrower than 560', () => {
    expect(clampChatWidth(300, 400)).toBe(280)
  })
  it('rounds to whole pixels', () => {
    expect(clampChatWidth(380.4, 1400)).toBe(380)
  })
  it('gives the default for a width that is not a number', () => {
    expect(clampChatWidth(NaN, 1400)).toBe(OFFLINE_CHAT_WIDTH_DEFAULT)
  })
})

describe('the remembered chat width', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it.each([
    ['nothing stored', null],
    ['text', 'abc'],
    ['below the minimum', '100'],
    ['above the maximum', '900'],
  ])('is the default for %s', (_label, stored) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, stored)
    expect(loadChatWidth()).toBe(OFFLINE_CHAT_WIDTH_DEFAULT)
  })

  it('reads a stored width in range', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, '420')
    expect(loadChatWidth()).toBe(420)
  })

  it('is the default when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadChatWidth()).toBe(OFFLINE_CHAT_WIDTH_DEFAULT)
  })

  it('stores a rounded width that loads back', () => {
    storeChatWidth(420.6)
    expect(loadChatWidth()).toBe(421)
  })

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => storeChatWidth(420)).not.toThrow()
  })
})

describe('lastStreamedAt', () => {
  it('ignores highlights and uploads, even newer ones, and uses the archive', () => {
    const archive = video({ created_at: '2026-11-01T10:00:00Z', duration: '1h0m0s' })
    const highlight = video({ type: 'highlight', created_at: '2026-11-05T10:00:00Z' })
    const upload = video({ type: 'upload', created_at: '2026-11-06T10:00:00Z' })
    expect(lastStreamedAt([upload, highlight, archive])).toBe(Date.parse('2026-11-01T11:00:00Z'))
  })

  it('uses the newest archive and adds its duration', () => {
    const older = video({ created_at: '2026-10-01T10:00:00Z', duration: '5h0m0s' })
    const newer = video({ created_at: '2026-11-01T10:00:00Z', duration: '2h30m0s' })
    expect(lastStreamedAt([older, newer])).toBe(Date.parse('2026-11-01T10:00:00Z') + 9_000_000)
  })

  it('is null when there is no archive', () => {
    expect(lastStreamedAt([])).toBeNull()
    expect(lastStreamedAt([video({ type: 'highlight' })])).toBeNull()
  })

  it('is null when the newest archive has an unreadable date', () => {
    expect(lastStreamedAt([video({ created_at: 'nope' })])).toBeNull()
  })
})

describe('formatAgo', () => {
  const now = Date.UTC(2026, 10, 11, 12, 0, 0)
  it.each([
    [59_000, 'just now'],
    [MINUTE, '1 minute ago'],
    [5 * MINUTE, '5 minutes ago'],
    [3 * HOUR, '3 hours ago'],
    [36 * HOUR, '1 day ago'],
    [3 * DAY, '3 days ago'],
    [15 * DAY, '2 weeks ago'],
    [70 * DAY, '2 months ago'],
  ])('says %i ms ago as "%s"', (elapsed, text) => {
    expect(formatAgo(now - elapsed, now)).toBe(text)
  })

  it('says "just now" for a time in the future', () => {
    expect(formatAgo(now + HOUR, now)).toBe('just now')
  })
})
