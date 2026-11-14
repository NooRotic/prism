import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { normalisePath, sectionForPath, sendHit } from '../usageApi'

const flags = vi.hoisted(() => ({ enabled: true, url: 'https://history.test' }))
vi.mock('../../config/historyServer', () => ({
  get HISTORY_ENABLED() {
    return flags.enabled
  },
  get HISTORY_API_URL() {
    return flags.url
  },
  SEND_VISITS: true,
}))

describe('sectionForPath', () => {
  it.each([
    ['/', 'home'],
    ['/twitch', 'twitch'],
    ['/twitch/streamer', 'twitch'],
    ['/twitch/', 'twitch'],
    ['/youtube', 'youtube'],
    ['/youtube/abc', 'youtube'],
    ['/hls-dash', 'hls-dash'],
    ['/hls-dash/custom', 'hls-dash'],
    ['/chat/streamer', 'chat-popout'],
    ['/nope', 'other'],
    ['/chat', 'other'],
    ['/twitch/a/b', 'other'],
    ['/twitchfoo', 'other'],
    ['/spike-pip.html', 'other'],
  ])('%s is counted as %s', (path, section) => {
    expect(sectionForPath(path)).toBe(section)
  })

  it.each([['/admin'], ['/admin/'], ['/admin/usage'], ['/admin/security'], ['/admin/anything/else']])(
    '%s is the owner\'s tool and is not counted',
    (path) => {
      expect(sectionForPath(path)).toBeNull()
    },
  )
})

describe('normalisePath', () => {
  it('ignores a trailing slash, except on the root', () => {
    expect(normalisePath('/twitch/')).toBe('/twitch')
    expect(normalisePath('/twitch')).toBe('/twitch')
    expect(normalisePath('/')).toBe('/')
    expect(normalisePath('//')).toBe('/')
  })
})

describe('sendHit', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    flags.enabled = true
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the section as a plain-text JSON body with no custom headers, so the browser sends no preflight', () => {
    sendHit('twitch')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/hit')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ section: 'twitch' })
    expect(init.headers).toBeUndefined()
    expect(init.credentials).toBe('omit')
    expect(init.keepalive).toBe(true)
  })

  it('swallows a failed request, whether it rejects or throws', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    expect(() => sendHit('home')).not.toThrow()
    await Promise.resolve()

    fetchMock.mockImplementationOnce(() => {
      throw new TypeError('no fetch')
    })
    expect(() => sendHit('home')).not.toThrow()
  })

  it('sends nothing with the kill switch off', () => {
    flags.enabled = false

    sendHit('home')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
