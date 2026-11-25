import type { CastStream } from '../../lib/cast/messages'
import { createCastEngine } from '../castEngine'

const STREAM: CastStream = { id: 'abc', name: 'News One', url: 'https://h.test/live.m3u8?token=secret', kind: 'hls', live: true, logo: 'https://d.test/logos/a.png' }

class FakeManager {
  listeners = new Map<string, Set<(e: unknown) => void>>()
  interceptors = new Map<string, (data: never) => unknown>()
  state = 'IDLE'
  live: { end?: number } | null = null
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
      events: { EventType: { ERROR: 'ERROR', PLAYER_LOADING: 'PLAYER_LOADING', LOADED_METADATA: 'LOADED_METADATA', MEDIA_FINISHED: 'MEDIA_FINISHED' }, EndedReason: { END_OF_STREAM: 'END_OF_STREAM', STOPPED: 'STOPPED', INTERRUPTED: 'INTERRUPTED' } },
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
    senderLoad(manager.load.mock.calls[0][0])
    expect(heard).not.toHaveBeenCalled()
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

  it('says ended and stopped, and not for a replaced one', async () => {
    const { manager, engine } = setup()
    await engine.load(STREAM)
    manager.emit('LOADED_METADATA')
    manager.emit('MEDIA_FINISHED', { endedReason: 'INTERRUPTED' })
    expect(engine.sample()).toBeNull() // IDLE, nothing to say
    manager.emit('MEDIA_FINISHED', { endedReason: 'END_OF_STREAM' })
    expect(engine.sample()?.ended).toBe(true)
    await engine.load(STREAM)
    manager.emit('LOADED_METADATA')
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
    manager.emit('ERROR')
    expect(heard).toHaveBeenCalledTimes(1)
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
    manager.live = null
    play()
    await engine.load({ ...STREAM, live: false })
    manager.live = { end: 120 }
    play()
    expect(manager.seek).toHaveBeenCalledTimes(1)
  })
})
