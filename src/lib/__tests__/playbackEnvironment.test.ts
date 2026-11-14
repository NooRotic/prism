import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectEnvironment, describeDecoding } from '../playbackEnvironment'

function stubMediaCapabilities(decodingInfo: unknown) {
  Object.defineProperty(navigator, 'mediaCapabilities', { value: decodingInfo === undefined ? undefined : { decodingInfo }, configurable: true })
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaCapabilities')
})

describe('collectEnvironment', () => {
  it('lists what the browser says it can decode, with the browser and the screen', () => {
    const isTypeSupported = vi.fn((type: string) => type.includes('avc1') || type.includes('mp4a.40.2'))
    vi.stubGlobal('MediaSource', { isTypeSupported })

    const env = collectEnvironment()

    expect(env.mediaSource).toBe(true)
    expect(env.userAgent).toBe(navigator.userAgent)
    expect(typeof env.devicePixelRatio).toBe('number')
    expect(env.viewport).toEqual([window.innerWidth, window.innerHeight])
    expect(env.codecs).toEqual({
      'H.264': true,
      HEVC: false,
      'Dolby Vision': false,
      AV1: false,
      VP9: false,
      AAC: true,
      'HE-AAC': false,
      'AC-3': false,
      'EC-3': false,
      Opus: false,
    })
    expect(isTypeSupported).toHaveBeenCalledWith('video/mp4; codecs="avc1.64001f"')
    expect(isTypeSupported).toHaveBeenCalledWith('audio/mp4; codecs="ec-3"')
  })

  it('says there is no Media Source and marks every codec unsupported when the browser has none', () => {
    vi.stubGlobal('MediaSource', undefined)

    const env = collectEnvironment()

    expect(env.mediaSource).toBe(false)
    expect(Object.values(env.codecs as Record<string, unknown>).every((value) => value === false)).toBe(true)
  })

  it('marks a codec "error" when asking about it throws, and carries on', () => {
    vi.stubGlobal('MediaSource', {
      isTypeSupported: (type: string) => {
        if (type.includes('hvc1')) throw new Error('boom')
        return true
      },
    })

    const codecs = collectEnvironment().codecs as Record<string, unknown>

    expect(codecs.HEVC).toBe('error')
    expect(codecs['H.264']).toBe(true)
  })
})

describe('describeDecoding', () => {
  it('asks about the video and audio codecs at the given size and words the answer on one line', async () => {
    const decodingInfo = vi.fn().mockResolvedValue({ supported: true, smooth: false, powerEfficient: false })
    stubMediaCapabilities(decodingInfo)

    const line = await describeDecoding('hvc1.2.4,mp4a.40.2', { width: 544, height: 306 })

    expect(decodingInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media-source',
        video: expect.objectContaining({ contentType: 'video/mp4; codecs="hvc1.2.4"', width: 544, height: 306 }),
        audio: { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
      }),
    )
    expect(line).toBe('MediaCapabilities: hvc1.2.4,mp4a.40.2 at 544x306: supported=true smooth=false powerEfficient=false')
  })

  it('uses a default size and leaves the audio out when the codecs name none', async () => {
    const decodingInfo = vi.fn().mockResolvedValue({ supported: false, smooth: false, powerEfficient: false })
    stubMediaCapabilities(decodingInfo)

    const line = await describeDecoding('dvh1.05.06')

    expect(decodingInfo.mock.calls[0][0]).not.toHaveProperty('audio')
    expect(line).toContain('at 1280x720: supported=false')
  })

  it('says so when the check fails', async () => {
    stubMediaCapabilities(vi.fn().mockRejectedValue(new TypeError('bad configuration')))

    expect(await describeDecoding('hvc1.2.4')).toBe('MediaCapabilities check failed: bad configuration')
  })

  it('says so when the browser has no MediaCapabilities', async () => {
    stubMediaCapabilities(undefined)

    expect(await describeDecoding('hvc1.2.4')).toBe('MediaCapabilities is not available in this browser')
  })

  it('says so when the codecs name no video codec', async () => {
    stubMediaCapabilities(vi.fn())

    expect(await describeDecoding('mp4a.40.2')).toBe('MediaCapabilities: no video codec to ask about in "mp4a.40.2"')
  })
})
