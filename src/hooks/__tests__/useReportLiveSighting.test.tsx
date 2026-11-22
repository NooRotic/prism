import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReportLiveSighting } from '../useReportLiveSighting'
import { readLiveLast, writeLiveLast } from '../../lib/youtubeLiveStore'
import { setSubscriptions } from '../../lib/catchupStore'
import type { VideoPageData } from '../../lib/videoPageApi'

const page = (state: 'live' | 'upcoming' | 'none', over: Partial<VideoPageData> = {}): VideoPageData => ({
  id: 'abcdefghijk',
  title: 'T',
  channelTitle: 'C',
  channelId: 'UC1',
  thumbnail: '',
  publishedAt: '2026-01-01T00:00:00Z',
  description: '',
  tags: [],
  topics: [],
  live: { state, viewerCount: state === 'live' ? 9 : null, startedAt: null },
  ...over,
})
const listed = { channelId: 'UC1', channelTitle: 'C', videoId: 'abcdefghijk', title: 'T', viewerCount: 1, startedAt: null, avatarUrl: '' }

beforeEach(() => {
  localStorage.clear()
  setSubscriptions([{ id: 'UC1', title: 'C' }])
})

describe('useReportLiveSighting', () => {
  it('adds a live video of a subscribed channel to the rail store', () => {
    renderHook(() => useReportLiveSighting(page('live')))
    expect(readLiveLast()!.streams.map((s) => s.videoId)).toEqual(['abcdefghijk'])
  })
  it('drops a listed video that has ended', () => {
    writeLiveLast({ checkedAt: 5, streams: [listed] })
    renderHook(() => useReportLiveSighting(page('none')))
    expect(readLiveLast()).toEqual({ checkedAt: 5, streams: [] })
  })
  it('leaves the store alone for an upcoming video', () => {
    writeLiveLast({ checkedAt: 5, streams: [listed] })
    renderHook(() => useReportLiveSighting(page('upcoming')))
    expect(readLiveLast()!.streams).toHaveLength(1)
  })
  it('does nothing while the page has no data', () => {
    renderHook(() => useReportLiveSighting(null))
    expect(readLiveLast()).toBeNull()
  })
})
