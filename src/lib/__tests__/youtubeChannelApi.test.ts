import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchYoutubeChannel } from '../youtubeChannelApi'
import { resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const urlOf = (call: unknown[]) => new URL(String(call[0]))
const item = { id: 'UCabc', snippet: { title: 'Mr Beast', customUrl: '@mrbeast', description: 'I also stream: twitch.tv/mrbeast', thumbnails: { default: { url: 'https://i/a.jpg' } } } }

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

describe('fetchYoutubeChannel', () => {
  it('reads a channel by handle with one call', async () => {
    fetchMock.mockResolvedValue(json({ items: [item] }))
    const r = await fetchYoutubeChannel({ handle: 'MrBeast' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0]).searchParams.get('forHandle')).toBe('@MrBeast')
    expect(r).toEqual({
      status: 'ok',
      channel: { channelId: 'UCabc', title: 'Mr Beast', handle: '@mrbeast', description: 'I also stream: twitch.tv/mrbeast', thumbnail: 'https://i/a.jpg' },
    })
  })

  it('reads a channel by id', async () => {
    fetchMock.mockResolvedValue(json({ items: [item] }))
    await fetchYoutubeChannel({ channelId: 'UCabc' })
    expect(urlOf(fetchMock.mock.calls[0]).searchParams.get('id')).toBe('UCabc')
  })

  it('says not found when there is no such channel', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }))
    expect(await fetchYoutubeChannel({ handle: 'nobodyhere' })).toEqual({ status: 'notfound' })
  })

  it('answers the same channel from the cache the second time', async () => {
    fetchMock.mockResolvedValue(json({ items: [item] }))
    await fetchYoutubeChannel({ handle: 'MrBeast' })
    await fetchYoutubeChannel({ handle: 'mrbeast' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an error on a refusal or a dead network, and does not remember it', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 500))
    expect(await fetchYoutubeChannel({ handle: 'MrBeast' })).toEqual({ status: 'error' })
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    expect(await fetchYoutubeChannel({ handle: 'MrBeast' })).toEqual({ status: 'error' })
    fetchMock.mockResolvedValueOnce(json({ items: [item] }))
    expect((await fetchYoutubeChannel({ handle: 'MrBeast' })).status).toBe('ok')
  })
})
