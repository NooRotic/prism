import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applySighting,
  readLiveLast,
  subscribeLiveLast,
  writeLiveLast,
  type LiveLast,
  type VideoLiveSighting,
} from '../youtubeLiveStore'
import type { LiveStream } from '../youtubeLive'

const subs = [{ id: 'UC1', title: 'One (saved)' }, { id: 'UC2', title: 'Two' }]

const stream = (over: Partial<LiveStream> = {}): LiveStream => ({
  channelId: 'UC1',
  channelTitle: 'One (saved)',
  videoId: 'vOld',
  title: 'old title',
  viewerCount: 3,
  startedAt: '2026-11-22T01:00:00Z',
  avatarUrl: 'https://img/one.jpg',
  ...over,
})

const sighting = (over: Partial<VideoLiveSighting> = {}): VideoLiveSighting => ({
  videoId: 'vNew',
  channelId: 'UC1',
  channelTitle: 'One (from video)',
  title: 'new title',
  isLive: true,
  viewerCount: 42,
  startedAt: '2026-11-22T04:00:00Z',
  ...over,
})

beforeEach(() => localStorage.clear())

describe('applySighting', () => {
  it('adds a live subscribed stream and leaves checkedAt alone', () => {
    const next = applySighting(null, sighting(), subs)
    expect(next).toEqual({
      checkedAt: null,
      streams: [
        {
          channelId: 'UC1',
          channelTitle: 'One (saved)',
          videoId: 'vNew',
          title: 'new title',
          viewerCount: 42,
          startedAt: '2026-11-22T04:00:00Z',
          avatarUrl: '',
        },
      ],
    })
    const kept = applySighting({ checkedAt: 1000, streams: [] }, sighting(), subs)
    expect(kept!.checkedAt).toBe(1000)
  })

  it('replaces the entry of the same channel with an older video, one entry per channel', () => {
    const last: LiveLast = { checkedAt: 5, streams: [stream(), stream({ channelId: 'UC2', videoId: 'v2' })] }
    const next = applySighting(last, sighting(), subs)!
    expect(next.streams).toHaveLength(2)
    expect(next.streams.find((s) => s.channelId === 'UC1')!.videoId).toBe('vNew')
  })

  it('refreshes the same video and keeps its avatar', () => {
    const last: LiveLast = { checkedAt: 5, streams: [stream({ videoId: 'vNew' })] }
    const next = applySighting(last, sighting(), subs)!
    expect(next.streams[0]).toMatchObject({ viewerCount: 42, startedAt: '2026-11-22T04:00:00Z', avatarUrl: 'https://img/one.jpg' })
  })

  it('drops a listed video that is no longer live', () => {
    const last: LiveLast = { checkedAt: 5, streams: [stream({ videoId: 'vNew' })] }
    expect(applySighting(last, sighting({ isLive: false }), subs)).toEqual({ checkedAt: 5, streams: [] })
  })

  it('changes nothing for a not-live video that is not listed', () => {
    expect(applySighting({ checkedAt: 5, streams: [stream()] }, sighting({ isLive: false }), subs)).toBeNull()
  })

  it('never adds a channel the viewer is not subscribed to', () => {
    expect(applySighting(null, sighting({ channelId: 'UCx' }), subs)).toBeNull()
  })
})

describe('the store', () => {
  it('round-trips what it writes', () => {
    const last: LiveLast = { checkedAt: null, streams: [stream()] }
    writeLiveLast(last)
    expect(readLiveLast()).toEqual(last)
  })

  it('reads the older shape with a numeric checkedAt', () => {
    localStorage.setItem('prism_youtube_live_last', JSON.stringify({ checkedAt: 7, streams: [] }))
    expect(readLiveLast()).toEqual({ checkedAt: 7, streams: [] })
  })

  it('treats damaged storage as no answer', () => {
    localStorage.setItem('prism_youtube_live_last', '{bad')
    expect(readLiveLast()).toBeNull()
  })

  it('tells subscribers about its own writes and about other tabs, not about other keys', () => {
    const cb = vi.fn()
    const off = subscribeLiveLast(cb)
    writeLiveLast({ checkedAt: 1, streams: [] })
    expect(cb).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: 'prism_youtube_live_last' }))
    expect(cb).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new StorageEvent('storage', { key: 'something_else' }))
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    writeLiveLast({ checkedAt: 2, streams: [] })
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
