import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchYoutubeChannel } from '../youtubeChannelApi'
import { resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
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

describe('fetchYoutubeChannel: remembering "no such channel"', () => {
  it('does not ask again for a handle YouTube said does not exist (so a page visit costs a unit once, not every time)', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }))
    expect(await fetchYoutubeChannel({ handle: 'nobodyhere' })).toEqual({ status: 'notfound' })
    expect(await fetchYoutubeChannel({ handle: 'NobodyHere' })).toEqual({ status: 'notfound' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 500)).mockResolvedValueOnce(json({ items: [] }))
    expect(await fetchYoutubeChannel({ handle: 'x_y_z' })).toEqual({ status: 'error' })
    expect(await fetchYoutubeChannel({ handle: 'x_y_z' })).toEqual({ status: 'notfound' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
