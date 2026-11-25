// A stand-in for Google's sender SDK, for tests: the parts PRISM uses, driven by the test.

type Listener = (event: never) => void

export interface FakeCast {
  options: unknown
  requestSession: ReturnType<typeof vi.fn<() => Promise<unknown>>>
  endCurrentSession: ReturnType<typeof vi.fn<(stop: boolean) => void>>
  loadMedia: ReturnType<typeof vi.fn<(request: { autoplay: boolean; media: Record<string, unknown> }) => Promise<unknown>>>
  sendMessage: ReturnType<typeof vi.fn<(namespace: string, data: unknown) => Promise<unknown>>>
  playOrPause: ReturnType<typeof vi.fn<() => void>>
  sdkReady(ok?: boolean): void
  hideFramework(): void
  showFramework(): void
  castState(state: string): void
  sessionStarted(device: string): void
  sessionResumed(device: string): void
  sessionEnded(): void
  message(data: unknown): void
  paused(on: boolean): void
}

export function installFakeCast(): FakeCast {
  const contextListeners = new Map<string, Listener[]>()
  const messageListeners: ((namespace: string, text: string) => void)[] = []
  const pausedListeners: Listener[] = []
  const player = { isPaused: false }
  let device = ''
  let current: unknown = null

  const emit = (type: string, event: unknown) => contextListeners.get(type)?.forEach((l) => l(event as never))
  const session = {
    getCastDevice: () => ({ friendlyName: device }),
    addMessageListener: (_namespace: string, l: (namespace: string, text: string) => void) => messageListeners.push(l),
    loadMedia: (request: never) => fake.loadMedia(request),
    sendMessage: (namespace: string, data: unknown) => fake.sendMessage(namespace, data),
  }
  const context = {
    setOptions: (options: unknown) => {
      fake.options = options
    },
    addEventListener: (type: string, l: Listener) => contextListeners.set(type, [...(contextListeners.get(type) ?? []), l]),
    getCastState: () => 'NO_DEVICES_AVAILABLE',
    getCurrentSession: () => current,
    requestSession: () => fake.requestSession(),
    endCurrentSession: (stop: boolean) => fake.endCurrentSession(stop),
  }
  const framework = {
    CastContext: { getInstance: () => context },
    CastContextEventType: { CAST_STATE_CHANGED: 'cast', SESSION_STATE_CHANGED: 'session' },
    CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE' },
    SessionState: { SESSION_STARTED: 'STARTED', SESSION_RESUMED: 'RESUMED', SESSION_ENDED: 'ENDED', SESSION_START_FAILED: 'START_FAILED' },
    RemotePlayer: function RemotePlayer() {
      return player
    },
    RemotePlayerController: function RemotePlayerController() {
      return { addEventListener: (_type: string, l: Listener) => pausedListeners.push(l), playOrPause: () => fake.playOrPause() }
    },
    RemotePlayerEventType: { IS_PAUSED_CHANGED: 'paused' },
  }
  class Media {
    contentId: string
    contentType: string
    constructor(contentId: string, contentType: string) {
      this.contentId = contentId
      this.contentType = contentType
    }
  }
  class LoadRequest {
    media: unknown
    autoplay = false
    constructor(media: unknown) {
      this.media = media
    }
  }
  class Image {
    url: string
    constructor(url: string) {
      this.url = url
    }
  }
  const holder: { framework?: typeof framework } = { framework }
  vi.stubGlobal('cast', holder)
  vi.stubGlobal('chrome', {
    cast: {
      AutoJoinPolicy: { TAB_AND_ORIGIN_SCOPED: 'tab_and_origin_scoped' },
      Image,
      media: { MediaInfo: Media, LoadRequest, GenericMediaMetadata: class {}, StreamType: { LIVE: 'LIVE', BUFFERED: 'BUFFERED' } },
    },
  })

  const begin = (state: string) => (name: string) => {
    device = name
    current = session
    emit('session', { sessionState: state })
  }
  const fake: FakeCast = {
    options: null,
    requestSession: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
    endCurrentSession: vi.fn<(stop: boolean) => void>(),
    loadMedia: vi.fn<(request: { autoplay: boolean; media: Record<string, unknown> }) => Promise<unknown>>(() => Promise.resolve()),
    sendMessage: vi.fn<(namespace: string, data: unknown) => Promise<unknown>>(() => Promise.resolve()),
    playOrPause: vi.fn<() => void>(),
    sdkReady: (ok = true) => (window as unknown as { __onGCastApiAvailable?: (ok: boolean) => void }).__onGCastApiAvailable?.(ok),
    hideFramework: () => {
      delete holder.framework
    },
    showFramework: () => {
      holder.framework = framework
    },
    castState: (state) => emit('cast', { castState: state }),
    sessionStarted: begin('STARTED'),
    sessionResumed: begin('RESUMED'),
    sessionEnded: () => {
      current = null
      emit('session', { sessionState: 'ENDED' })
    },
    message: (data) => messageListeners.at(-1)?.('ns', JSON.stringify(data)),
    paused: (on) => {
      player.isPaused = on
      pausedListeners.forEach((l) => l({} as never))
    },
  }
  return fake
}
