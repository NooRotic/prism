import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoJSPlayer from '../VideoJSPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import { beginPlayback, endPlayback, getPlaybackSnapshot } from '../../../lib/playbackLog'
import { avoidedFormats, resetAvoidedFormats } from '../../../lib/renditionGuard'

vi.mock('../../../lib/playbackEnvironment', () => ({ describeDecoding: vi.fn(() => Promise.resolve('MediaCapabilities: stub line')) }))

// A stand-in for the one video.js player, as in VideoJSPlayer.stall.test.tsx, with the parts the recovery reads: the
// current rendition and the list of renditions of the tech's `vhs`, `src` to reload with and `error(null)` to clear.
const fake = vi.hoisted(() => {
  const handlers: Record<string, Array<() => void>> = {}
  const vhsState = { current: undefined as string | undefined, all: [] as string[] }
  const player = {
    on: (name: string, fn: () => void) => {
      ;(handlers[name] ??= []).push(fn)
    },
    play: vi.fn(() => Promise.resolve()),
    src: vi.fn(),
    isDisposed: () => false,
    dispose: () => {},
    error: vi.fn((): { code?: number; message?: string } | null => null),
    currentTime: () => 0,
    duration: () => 0,
    paused: () => false,
    muted: () => true,
    volume: () => 1,
    buffered: () => ({ length: 0 }),
    tech: vi.fn(() =>
      vhsState.current === undefined && vhsState.all.length === 0
        ? {}
        : {
            vhs: {
              playlists: {
                media: () => (vhsState.current === undefined ? undefined : { attributes: { CODECS: vhsState.current, BANDWIDTH: 573116, RESOLUTION: { width: 544, height: 306 } } }),
                main: { playlists: vhsState.all.map((CODECS) => ({ attributes: { CODECS } })) },
              },
            },
          },
    ),
  }
  return {
    player,
    vhsState,
    emit: (name: string) => (handlers[name] ?? []).forEach((fn) => fn()),
    reset: () => {
      for (const key of Object.keys(handlers)) delete handlers[key]
      player.error.mockReset()
      player.error.mockReturnValue(null)
      player.src.mockReset()
      player.play.mockReset()
      player.play.mockReturnValue(Promise.resolve())
      vhsState.current = undefined
      vhsState.all = []
    },
  }
})

vi.mock('video.js', () => ({ default: vi.fn(() => fake.player) }))

const URL_OF = 'https://h.test/live/a.m3u8?token=secret'
const hls: URLDetectionResult = { type: 'hls', originalUrl: URL_OF, playableUrl: URL_OF }

function mount(props: Partial<React.ComponentProps<typeof VideoJSPlayer>> = {}) {
  return render(<VideoJSPlayer url={URL_OF} detection={hls} {...props} />)
}

const decodeError = (codecs: string | undefined, all: string[]) => {
  fake.vhsState.current = codecs
  fake.vhsState.all = all
  fake.player.error.mockReturnValue({ code: 3, message: 'video append of 56283b failed for segment #0 in playlist hdr10plus/prog_index.m3u8' })
  fake.emit('error')
}
const messages = () => getPlaybackSnapshot().entries.map((entry) => entry.message)

describe('VideoJSPlayer: logging and decode recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fake.reset()
    resetAvoidedFormats()
    endPlayback()
    beginPlayback({ url: URL_OF, kind: 'hls' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    endPlayback()
  })

  it('logs where it is loading from without the query value, and what the player reports', () => {
    mount()

    fake.emit('loadstart')
    fake.emit('loadeddata')

    expect(messages()).toEqual(expect.arrayContaining([expect.stringContaining('https://h.test/live/a.m3u8?token=***'), 'loadstart', 'loadeddata']))
    expect(messages().join('\n')).not.toContain('secret')
  })

  it('says "playing" in the log, and moves the session to playing', () => {
    mount()

    fake.emit('playing')

    expect(getPlaybackSnapshot().status).toBe('playing')
    expect(getPlaybackSnapshot().entries.at(-1)).toMatchObject({ level: 'ok', source: 'videojs', message: 'playing' })
  })

  it('logs a stall and a failing playlist fetch as warnings', () => {
    const onStall = vi.fn()
    mount({ onStall })

    vi.advanceTimersByTime(12_000)
    fake.emit('retryplaylist')

    const warnings = getPlaybackSnapshot().entries.filter((entry) => entry.level === 'warn').map((entry) => entry.message)
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('12 seconds'), expect.stringContaining('playlist')]))
  })

  it('on a decode failure of HEVC, avoids HEVC and reloads the same source without telling the page it failed', () => {
    const onError = vi.fn()
    mount({ onError })

    decodeError('hvc1.2.4,mp4a.40.2', ['avc1.64001f,mp4a.40.2', 'hvc1.2.4,mp4a.40.2'])

    expect(fake.player.error).toHaveBeenCalledWith(null)
    expect(fake.player.src).toHaveBeenCalledWith({ src: URL_OF, type: 'application/x-mpegURL' })
    expect(fake.player.play).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(avoidedFormats()).toEqual(['hevc'])
    expect(getPlaybackSnapshot().status).toBe('retrying')
    expect(messages()).toEqual(
      expect.arrayContaining([expect.stringContaining('Video.js error 3'), expect.stringContaining('hevc failed to decode; avoiding it and reloading (recovery 1 of 2)'), 'Attempt 2: retrying']),
    )
  })

  it('writes down what the browser says about decoding the failing format', async () => {
    mount()

    decodeError('hvc1.2.4,mp4a.40.2', ['avc1.64001f,mp4a.40.2', 'hvc1.2.4,mp4a.40.2'])
    await vi.advanceTimersByTimeAsync(0)

    expect(messages()).toContain('MediaCapabilities: stub line')
  })

  it('gives up after two recoveries and then tells the page', () => {
    const onError = vi.fn()
    mount({ onError })

    decodeError('hvc1.2.4,mp4a.40.2', ['avc1.64001f,mp4a.40.2', 'hvc1.2.4,mp4a.40.2'])
    decodeError('dvh1.05.06,ec-3', ['avc1.64001f,mp4a.40.2', 'dvh1.05.06,ec-3', 'hvc1.2.4,mp4a.40.2'])
    expect(fake.player.src).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()

    decodeError('av01.0.05M.08', ['avc1.64001f,mp4a.40.2', 'av01.0.05M.08'])

    expect(fake.player.src).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(avoidedFormats()).toEqual(['hevc', 'dolby-vision'])
    expect(messages().some((message) => message.startsWith('not retrying: already reloaded 2 times'))).toBe(true)
  })

  it('tells the page at once when the stream has no other video format to fall back to', () => {
    const onError = vi.fn()
    mount({ onError })

    decodeError('hvc1.2.4,mp4a.40.2', ['hvc1.2.4,mp4a.40.2', 'hev1.1.6,mp4a.40.2'])

    expect(fake.player.src).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('video append'))
    expect(avoidedFormats()).toEqual([])
  })

  it('tells the page at once when it cannot tell which format failed', () => {
    const onError = vi.fn()
    mount({ onError })

    fake.player.error.mockReturnValue({ code: 3, message: 'decode' })
    fake.emit('error')

    expect(fake.player.src).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('decode')
  })

  it('keeps the old words for a source it cannot use, and for other errors', () => {
    const onError = vi.fn()
    mount({ onError })

    fake.player.error.mockReturnValue({ code: 4, message: 'ignored' })
    fake.emit('error')
    fake.player.error.mockReturnValue({ code: 2, message: 'network down' })
    fake.emit('error')

    expect(onError).toHaveBeenNthCalledWith(1, 'Video.js could not use this source (code 4)')
    expect(onError).toHaveBeenNthCalledWith(2, 'network down')
    expect(fake.player.src).not.toHaveBeenCalled()
  })

  it('keeps an inspection of the player when it gives up', () => {
    mount({ onError: vi.fn() })

    decodeError('avc1.64001f,mp4a.40.2', ['avc1.64001f,mp4a.40.2'])

    const inspection = getPlaybackSnapshot().inspection
    expect(inspection).not.toBeNull()
    expect(inspection).toMatchObject({ errorCode: 3, rendition: '544x306', renditionCodecs: 'avc1.64001f,mp4a.40.2', renditionsTotal: 1 })
    expect(inspection).toHaveProperty('readyState')
  })

  it('writes nothing when no session is running', () => {
    endPlayback()
    mount()

    fake.emit('loadstart')
    fake.emit('playing')

    expect(getPlaybackSnapshot()).toMatchObject({ status: 'idle', entries: [] })
  })
})
