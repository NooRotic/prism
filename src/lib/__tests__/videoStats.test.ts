import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withStats } from '../videoStats'
import { resetQuotaForTests } from '../youtubeQuota'
import type { YouTubeVideo } from '../youtubeApi'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const vid = (id: string, over: Partial<YouTubeVideo> = {}): YouTubeVideo => ({ id, title: id, channelTitle: 'c', thumbnail: '', publishedAt: '', description: '', ...over })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  resetQuotaForTests()
  vi.stubEnv('VITE_YOUTUBE_API_KEY', 'k')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('withStats', () => {
  it('fills in view counts and publish dates with ONE call for all the videos', async () => {
    fetchMock.mockResolvedValue(
      json({
        items: [
          { id: 'a', snippet: { publishedAt: '2026-02-01T00:00:00Z' }, statistics: { viewCount: '77' } },
          { id: 'b', snippet: { publishedAt: '2026-03-01T00:00:00Z' }, statistics: { viewCount: '88' } },
        ],
      }),
    )
    const out = await withStats([vid('a'), vid('b')])
    expect(out.map((x) => [x.id, x.viewCount, x.publishedAt])).toEqual([
      ['a', '77', '2026-02-01T00:00:00Z'],
      ['b', '88', '2026-03-01T00:00:00Z'],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('id=a%2Cb')
  })

  it('asks nothing again for videos it already knows, and nothing at all when every video is complete', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: 'a', snippet: { publishedAt: '2026-02-01T00:00:00Z' }, statistics: { viewCount: '77' } }] }))
    await withStats([vid('a')])
    await withStats([vid('a')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const done = await withStats([vid('z', { viewCount: '1', publishedAt: '2026-01-01T00:00:00Z' })])
    expect(done[0].viewCount).toBe('1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the list as it was when the call fails', async () => {
    fetchMock.mockResolvedValue(json({ error: {} }, 500))
    const input = [vid('a', { publishedAt: '2026-02-01T00:00:00Z' })]
    expect(await withStats(input)).toEqual(input)
  })

  it('leaves a hidden view count missing instead of inventing one', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: 'a', snippet: { publishedAt: '2026-02-01T00:00:00Z' }, statistics: {} }] }))
    expect((await withStats([vid('a')]))[0].viewCount).toBeUndefined()
  })
})
