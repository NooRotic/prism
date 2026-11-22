import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatchupVideo } from '../../lib/catchup'
import { describeVideos } from '../../lib/catchupApi'
import { fetchMixIds } from '../../lib/mixRelated'
import { getComments, getPlaylistItems, getVideoPage, type VideoPageData } from '../../lib/videoPageApi'
import { writeQueueSnapshot } from '../../lib/videoContext'
import { useRelatedVideos } from '../useRelatedVideos'
import { useVideoComments } from '../useVideoComments'
import { useVideoContext } from '../useVideoContext'
import { useVideoPage } from '../useVideoPage'

vi.mock('../../lib/videoPageApi', () => ({ getVideoPage: vi.fn(), getComments: vi.fn(), getPlaylistItems: vi.fn() }))
vi.mock('../../lib/mixRelated', () => ({ fetchMixIds: vi.fn() }))
vi.mock('../../lib/catchupApi', () => ({ describeVideos: vi.fn() }))

const page = (id: string): VideoPageData => ({
  id, title: `T-${id}`, channelTitle: 'C', channelId: 'UC', thumbnail: '', publishedAt: '', description: '', tags: [], topics: [],
  live: { state: 'none', viewerCount: null, startedAt: null },
})
const cv = (id: string): CatchupVideo => ({ id, title: id, channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' })

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
})

describe('useVideoPage', () => {
  it('never shows the previous video after the id changes, even when its answer arrives late', async () => {
    let resolveA!: (v: VideoPageData) => void
    vi.mocked(getVideoPage).mockImplementation((id) =>
      id === 'A' ? new Promise((r) => { resolveA = r }) : Promise.resolve(page('B')),
    )
    const { result, rerender } = renderHook(({ id }) => useVideoPage(id), { initialProps: { id: 'A' } })
    expect(result.current.status).toBe('loading')
    rerender({ id: 'B' })
    await waitFor(() => expect(result.current.data?.id).toBe('B'))
    await act(async () => resolveA(page('A')))
    expect(result.current.data?.id).toBe('B')
  })
  it('is unavailable when there is no data', async () => {
    vi.mocked(getVideoPage).mockResolvedValue(null)
    const { result } = renderHook(() => useVideoPage('A'))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })
})

describe('useVideoComments', () => {
  it('is null while loading, then the result', async () => {
    vi.mocked(getComments).mockResolvedValue({ status: 'disabled' })
    const { result } = renderHook(() => useVideoComments('A'))
    expect(result.current.result).toBeNull()
    await waitFor(() => expect(result.current.result).toEqual({ status: 'disabled' }))
  })
})

describe('useVideoContext', () => {
  it('has no context without a source in the address', () => {
    const { result } = renderHook(() => useVideoContext('a', ''))
    expect(result.current.status).toBe('none')
    expect(result.current.strip).toBeNull()
  })
  it('builds the strip from the Catch up snapshot', () => {
    writeQueueSnapshot([cv('a'), cv('b'), cv('c')])
    const { result } = renderHook(() => useVideoContext('b', '?from=catchup'))
    expect(result.current.status).toBe('ready')
    expect(result.current.strip?.index).toBe(1)
  })
  it('is ready with no strip when the video is not in the snapshot', () => {
    writeQueueSnapshot([cv('a')])
    const { result } = renderHook(() => useVideoContext('zzz', '?from=catchup'))
    expect(result.current.status).toBe('ready')
    expect(result.current.strip).toBeNull()
  })
  it('pages a playlist until it finds the video', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    vi.mocked(getPlaylistItems)
      .mockResolvedValueOnce({ status: 'ok', items: [item('a'), item('b')], nextPageToken: 'N', totalResults: 3 })
      .mockResolvedValueOnce({ status: 'ok', items: [item('c')], nextPageToken: null, totalResults: 3 })
    const { result } = renderHook(() => useVideoContext('c', '?list=PLabcdefghij'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.strip?.index).toBe(2)
    expect(getPlaylistItems).toHaveBeenCalledTimes(2)
  })
  it('reads one more page when the video is near the end of a loaded page, and reports the true total', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    const first = Array.from({ length: 10 }, (_, i) => item(`p${i}`))
    const second = Array.from({ length: 5 }, (_, i) => item(`q${i}`))
    vi.mocked(getPlaylistItems)
      .mockResolvedValueOnce({ status: 'ok', items: first, nextPageToken: 'N', totalResults: 15 })
      .mockResolvedValueOnce({ status: 'ok', items: second, nextPageToken: null, totalResults: 15 })
    const { result } = renderHook(() => useVideoContext('p8', '?list=PLabcdefghij'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(getPlaylistItems).toHaveBeenCalledTimes(2)
    expect(result.current.strip?.next?.id).toBe('p9')
    expect(result.current.strip?.after.map((i) => i.id)).toContain('q2')
    expect(result.current.strip?.total).toBe(15)
  })
  it('does not read more pages when the video is far from the end', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    vi.mocked(getPlaylistItems).mockResolvedValue({
      status: 'ok',
      items: Array.from({ length: 50 }, (_, i) => item(`p${i}`)),
      nextPageToken: 'N',
      totalResults: 120,
    })
    const { result } = renderHook(() => useVideoContext('p3', '?list=PLabcdefghij'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(getPlaylistItems).toHaveBeenCalledTimes(1)
    expect(result.current.strip?.total).toBe(120)
  })
  it('keeps showing the strip while moving to another video in the playlist it already read', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    vi.mocked(getPlaylistItems).mockResolvedValue({
      status: 'ok',
      items: Array.from({ length: 12 }, (_, i) => item(`p${i}`)),
      nextPageToken: null,
      totalResults: 12,
    })
    const { result, rerender } = renderHook(({ id }) => useVideoContext(id, '?list=PLabcdefghij'), { initialProps: { id: 'p1' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ id: 'p2' })
    expect(result.current.status).toBe('ready')
    expect(result.current.strip?.current.id).toBe('p2')
  })
  it('does not show the old strip for a video that is not in the list it read', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    vi.mocked(getPlaylistItems).mockResolvedValue({ status: 'ok', items: [item('a'), item('b')], nextPageToken: null, totalResults: 2 })
    const { result, rerender } = renderHook(({ id }) => useVideoContext(id, '?list=PLabcdefghij'), { initialProps: { id: 'a' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ id: 'zzz' })
    expect(result.current.status).toBe('loading')
  })
  it('lists a video once when the playlist repeats it', async () => {
    const item = (id: string) => ({ id, title: id, thumbnail: '' })
    vi.mocked(getPlaylistItems).mockResolvedValue({ status: 'ok', items: [item('a'), item('b'), item('a'), item('c')], nextPageToken: null, totalResults: 4 })
    const { result } = renderHook(() => useVideoContext('a', '?list=PLabcdefghij'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.strip?.after.map((i) => i.id)).toEqual(['b', 'c'])
  })
  it('is unreadable when the playlist cannot be read', async () => {
    vi.mocked(getPlaylistItems).mockResolvedValue({ status: 'unreadable' })
    const { result } = renderHook(() => useVideoContext('c', '?list=PLabcdefghij'))
    await waitFor(() => expect(result.current.status).toBe('unreadable'))
  })
})

describe('useRelatedVideos', () => {
  it('describes the first 12 Mix ids', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id${i}`)
    vi.mocked(fetchMixIds).mockResolvedValue(ids)
    vi.mocked(describeVideos).mockResolvedValue([cv('id0')])
    const { result } = renderHook(() => useRelatedVideos('seed'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(vi.mocked(describeVideos).mock.calls[0][0]).toEqual(ids.slice(0, 12))
  })
  it('is empty when the Mix gives nothing', async () => {
    vi.mocked(fetchMixIds).mockResolvedValue([])
    const { result } = renderHook(() => useRelatedVideos('seed'))
    await waitFor(() => expect(result.current.status).toBe('empty'))
    expect(describeVideos).not.toHaveBeenCalled()
  })
})
