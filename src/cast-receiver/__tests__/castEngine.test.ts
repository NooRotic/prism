import type { CastStream } from '../../lib/cast/messages'
import { createCastEngine } from '../castEngine'

const STREAM: CastStream = { id: 'abc', name: 'News One', url: 'https://h.test/live.m3u8?token=secret', kind: 'hls', live: true, logo: 'https://d.test/logos/a.png' }

class FakeManager {
  listeners = new Map<string, Set<(e: unknown) => void>>()
  interceptors = new Map<string, (data: never) => unknown>()
  state = 'IDLE'
  live: { end?: number } | null = null
  stats: () => unknown = () => ({})
  getStats() {
    return this.stats()
  }
  load = vi.fn<(request: unknown) => Promise<void>>(() => Promise.resolve())
  stop = vi.fn()
  seek = vi.fn()
  addEventListener(type: string, l: (e: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(l)
    this.listeners.set(type, set)
  }
  setMessageInterceptor(type: string, f: (data: never) => unknown) {
    this.interceptors.set(type, f)
  }
  getPlayerState() {
    return this.state
  }
  getLiveSeekableRange() {
    return this.live
  }
  emit(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((l) => l(event))
  }
}

class Plain {}
const media = { time: 0, element: null as HTMLVideoElement | null }

beforeEach(() => {
  media.element = document.createElement('video')
  Object.defineProperty(media.element, 'currentTime', { configurable: true, get: () => media.time })
  document.body.append(media.element)
  vi.stubGlobal('cast', {
    framework: {
      events: { EventType: { ERROR: 'ERROR', PLAYER_LOADING: 'PLAYER_LOADING', LOADED_METADATA: 'LOADED_METADATA', MEDIA_FINISHED: 'MEDIA_FINISHED', BUFFERING: 'BUFFERING', PLAYING: 'PLAYING', PAUSE: 'PAUSE' }, EndedReason: { END_OF_STREAM: 'END_OF_STREAM', STOPPED: 'STOPPED', SENDER_STOPPED: 'SENDER_STOPPED', INTERRUPTED: 'INTERRUPTED' }, DetailedErrorCode: { IMAGE_ERROR: 903, LOAD_INTERRUPTED: 904, MEDIA_ERROR_MESSAGE: 906 } },
      messages: {
        MessageType: { LOAD: 'LOAD', PLAY: 'PLAY' },
        PlayerState: { IDLE: 'IDLE', PAUSED: 'PAUSED', PLAYING: 'PLAYING' },
        StreamType: { LIVE: 'LIVE', BUFFERED: 'BUFFERED' },
        ErrorType: { LOAD_FAILED: 'LOAD_FAILED' },
        LoadRequestData: Plain,
        MediaInformation: Plain,
        GenericMediaMetadata: Plain,
        Image: class {
          url: string
          constructor(url: string) {
            this.url = url
          }
        },
        ErrorData: class {
          type: string
          constructor(type: string) {
            this.type = type
          }
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function setup() {
  const manager = new FakeManager()
  const engine = createCastEngine(manager as unknown as cast.framework.PlayerManager)
  const senderLoad = (request: unknown) => manager.interceptors.get('LOAD')?.(request as never)
  return { manager, engine, senderLoad }
}

const SENDER_MEDIA = {
  contentId: 'abc',
  contentUrl: STREAM.url,
  contentType: 'application/x-mpegurl',
  metadata: { title: 'News One', images: [{ url: 'https://d.test/logos/a.png' }] },
  customData: { v: 1, id: 'abc', kind: 'hls', live: true, favorites: ['a'], group: 'News' },
}

describe('load', () => {
  it('asks Cast for the stream, with its name and picture and no address where a title or id shows', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    const request = manager.load.mock.calls[0][0] as { autoplay: boolean; media: Record<string, unknown> }
    expect(request.autoplay).toBe(true)
    expect(request.media).toMatchObject({ contentId: 'abc', contentUrl: STREAM.url, contentType: 'application/x-mpegurl', streamType: 'LIVE', metadata: { title: 'News One', images: [{ url: STREAM.logo }] } })
    expect(request.media.customData).toMatchObject({ v: 1, id: 'abc', kind: 'hls', live: true })
  })

  it('names a pasted stream and a recording', async () => {
    const { manager, engine } = setup()
    await engine.load({ ...STREAM, id: null, kind: 'dash', live: false, logo: null })
    const { media: info } = manager.load.mock.calls[0][0] as { media: Record<string, unknown> }
    expect(info).toMatchObject({ contentId: 'pasted', contentType: 'application/dash+xml', streamType: 'BUFFERED' })
  })
})

describe('a load made by the sender', () => {
  it('is reported and passed on', () => {
    const { engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    const request = { media: { ...SENDER_MEDIA } }
    expect(senderLoad(request)).toBe(request)
    expect(heard).toHaveBeenCalledWith({ ...STREAM }, SENDER_MEDIA.customData)
    expect((request.media as Record<string, unknown>).streamType).toBe('LIVE')
  })

  it('from another app is played by what it says it is', () => {
    const { engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    senderLoad({ media: { contentId: 'https://h.test/x.mpd', contentType: 'application/dash+xml' } })
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ id: null, url: 'https://h.test/x.mpd', kind: 'dash', name: 'Stream' }), null)
  })

  it.each(['javascript:alert(1)', 'file:///etc/passwd', '', undefined])('is refused for the address %s', (contentUrl) => {
    const { engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    expect(senderLoad({ media: { ...SENDER_MEDIA, contentId: 'abc', contentUrl } })).toMatchObject({ type: 'LOAD_FAILED' })
    expect(heard).not.toHaveBeenCalled()
  })

  it('is told from the engine’s own, which may pass the same way', async () => {
    const { manager, engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    await engine.load(STREAM)
    senderLoad(manager.load.mock.calls[0][0]) // measured: Cast passes its own loads through the interceptor
    expect(heard).not.toHaveBeenCalled()
  })

  it('cannot pass itself off as the engine’s own', async () => {
    const { manager, engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    expect(senderLoad({ media: { ...SENDER_MEDIA, contentUrl: 'javascript:alert(1)', customData: { origin: 'tv' } } })).toMatchObject({ type: 'LOAD_FAILED' })
    // What the engine put on a load is visible to everyone who reads the status; sent back, it is a sender's load.
    await engine.load(STREAM)
    const own = manager.load.mock.calls[0][0] as { media: Record<string, unknown> }
    senderLoad(own)
    senderLoad({ media: { ...own.media, contentUrl: 'https://h.test/other.m3u8' } })
    expect(heard).toHaveBeenCalledTimes(1)
    await engine.load(STREAM)
    const again = manager.load.mock.calls[1][0] as { media: Record<string, unknown> }
    expect(senderLoad({ media: { ...again.media, contentUrl: 'file:///x' } })).toMatchObject({ type: 'LOAD_FAILED' })
  })

  it('keeps two quick loads of its own apart from a sender’s', async () => {
    const { manager, engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    await engine.load(STREAM)
    await engine.load({ ...STREAM, id: 'def' })
    senderLoad(manager.load.mock.calls[0][0])
    senderLoad(manager.load.mock.calls[1][0])
    expect(heard).not.toHaveBeenCalled()
  })

  it('plays a plain http address it is sent, and keeps an odd title and picture out', () => {
    const { engine, senderLoad } = setup()
    const heard = vi.fn()
    engine.onSenderLoad(heard)
    senderLoad({ media: { ...SENDER_MEDIA, contentUrl: 'http://h.test/a.m3u8', metadata: { title: 'x'.repeat(5000), images: [{ url: 'javascript:alert(1)' }] } } })
    const [stream] = heard.mock.calls[0] as [CastStream]
    expect(stream.url).toBe('http://h.test/a.m3u8')
    expect(stream.name).toHaveLength(200)
    expect(stream.logo).toBeNull()
  })
})

describe('sample', () => {
  it('is empty until the new stream’s own data is there, so the old one’s picture never counts', async () => {
    const { manager, engine } = setup()
    expect(engine.sample()).toBeNull()
    await engine.load(STREAM)
    manager.state = 'PLAYING'
    media.time = 44
    expect(engine.sample()).toBeNull()
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    expect(engine.sample()).toEqual({ time: 44, paused: false, ended: false, stopped: false })
    manager.state = 'PAUSED'
    expect(engine.sample()?.paused).toBe(true)
    await engine.load(STREAM)
    expect(engine.sample()).toBeNull()
  })

  it('does not take the last stream’s late data for the new one’s', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    await engine.load({ ...STREAM, id: 'def' }) // Cast starts it only when the first has given up
    manager.emit('LOADED_METADATA')
    manager.state = 'PLAYING'
    expect(engine.sample()).toBeNull()
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    expect(engine.sample()).not.toBeNull()
  })

  it('finds the picture inside Cast’s own element, where it lives', async () => {
    document.body.innerHTML = ''
    const host = document.createElement('cast-media-player')
    const inner = document.createElement('div')
    host.attachShadow({ mode: 'open' }).append(inner)
    inner.attachShadow({ mode: 'open' }).append(media.element as HTMLVideoElement)
    document.body.append(host)
    media.time = 7
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    manager.state = 'PLAYING'
    expect(engine.sample()?.time).toBe(7)
  })

  it('says ended and stopped, and not for a replaced one', async () => {
    const { manager, engine } = setup()
    const tuned = async () => {
      await engine.load(STREAM)
      manager.emit('PLAYER_LOADING')
      manager.emit('LOADED_METADATA')
    }
    await tuned()
    manager.emit('MEDIA_FINISHED', { endedReason: 'INTERRUPTED' })
    expect(engine.sample()).toBeNull() // IDLE, nothing to say
    manager.emit('MEDIA_FINISHED', { endedReason: 'END_OF_STREAM' })
    expect(engine.sample()?.ended).toBe(true)
    for (const endedReason of ['STOPPED', 'SENDER_STOPPED']) {
      await tuned()
      manager.emit('MEDIA_FINISHED', { endedReason })
      expect(engine.sample()?.stopped).toBe(true)
    }
  })

  it('says stopped while still loading, and not for the stream before', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('MEDIA_FINISHED', { endedReason: 'STOPPED' }) // the last one's
    expect(engine.sample()).toBeNull()
    manager.emit('PLAYER_LOADING')
    manager.emit('MEDIA_FINISHED', { endedReason: 'STOPPED' })
    expect(engine.sample()?.stopped).toBe(true)
  })
})

describe('errors', () => {
  it('count from when Cast has begun the current load', async () => {
    const { manager, engine } = setup()
    const heard = vi.fn()
    engine.onError(heard)
    await engine.load(STREAM)
    manager.emit('ERROR') // the old stream's
    expect(heard).not.toHaveBeenCalled()
    manager.emit('PLAYER_LOADING')
    manager.emit('ERROR', { detailedErrorCode: 310 })
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it.each([903, 904, 906])('%s is not the stream’s: a picture, a replaced load, a message', async (detailedErrorCode) => {
    const { manager, engine } = setup()
    const heard = vi.fn()
    engine.onError(heard)
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    manager.emit('ERROR', { detailedErrorCode })
    expect(heard).not.toHaveBeenCalled()
  })

  it('with no code count', async () => {
    const { manager, engine } = setup()
    const heard = vi.fn()
    engine.onError(heard)
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    manager.emit('ERROR')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('thrown by Cast at once are a refused load', async () => {
    const { manager, engine } = setup()
    manager.load.mockImplementationOnce(() => {
      throw new TypeError('no')
    })
    await expect(engine.load(STREAM)).rejects.toThrow('no')
  })
})

describe('report', () => {
  it('gives the latest step of the stream that is loading, and starts again with each load', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    expect(engine.report()).toEqual({ engine: 'shaka', step: null })
    manager.emit('PLAYER_LOADING')
    expect(engine.report().step).toBe('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    manager.emit('BUFFERING', { isBuffering: true })
    expect(engine.report().step).toBe('BUFFERING')
    manager.emit('PLAYING')
    expect(engine.report().step).toBe('PLAYING')
    manager.emit('ERROR', { detailedErrorCode: 905 })
    expect(engine.report().step).toBe('ERROR 905')
    await engine.load(STREAM)
    expect(engine.report().step).toBeNull()
  })

  it('ignores the stream before: nothing counts until Cast has begun the new load', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('ERROR', { detailedErrorCode: 905 })
    manager.emit('PLAYING')
    expect(engine.report().step).toBeNull()
  })

  it('reads Cast’s statistics and the picture', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    manager.state = 'PLAYING'
    manager.stats = () => ({ width: 1920, height: 1080, streamBandwidth: 6.2e6, estimatedBandwidth: 4.1e7, droppedFrames: 0 })
    manager.live = { end: 14.1 }
    media.time = 10
    Object.defineProperty(media.element, 'buffered', { configurable: true, get: () => ({ length: 1, start: () => 2, end: () => 18.4 }) })
    const report = engine.report()
    expect(report).toMatchObject({ engine: 'shaka', step: 'LOADED_METADATA', width: 1920, height: 1080, bitrate: 6.2e6, bandwidth: 4.1e7, dropped: 0 })
    expect(report.buffered).toBeCloseTo(8.4)
    expect(report.behindLive).toBeCloseTo(4.1)
  })

  it('a recording is never behind live', async () => {
    const { manager, engine } = setup()
    await engine.load({ ...STREAM, live: false })
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    manager.state = 'PLAYING'
    manager.live = { end: 14.1 }
    expect(engine.report().behindLive).toBeUndefined()
  })

  it('leaves out what is missing or nonsense', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('PLAYER_LOADING')
    manager.emit('LOADED_METADATA')
    manager.state = 'PLAYING'
    manager.stats = () => ({ width: Number.NaN, height: -1, streamBandwidth: Number.POSITIVE_INFINITY, droppedFrames: 'none' })
    media.element?.remove()
    expect(engine.report()).toEqual({ engine: 'shaka', step: 'LOADED_METADATA' })
    manager.stats = () => {
      throw new Error('not yet')
    }
    expect(engine.report()).toEqual({ engine: 'shaka', step: 'LOADED_METADATA' })
  })
})

describe('resuming', () => {
  it('a paused live stream goes to the live edge; a recording stays where it was', async () => {
    const { manager, engine } = setup()
    const play = () => manager.interceptors.get('PLAY')?.({ type: 'PLAY' } as never)
    await engine.load(STREAM)
    manager.state = 'PAUSED'
    manager.live = { end: 120 }
    expect(play()).toEqual({ type: 'PLAY' })
    expect(manager.seek).toHaveBeenCalledWith(120)
    manager.state = 'PLAYING'
    play() // not a resume
    manager.state = 'PAUSED'
    manager.live = null // some live streams have no range to offer
    play()
    await engine.load({ ...STREAM, live: false })
    manager.live = { end: 120 }
    play()
    expect(manager.seek).toHaveBeenCalledTimes(1)
  })
})
