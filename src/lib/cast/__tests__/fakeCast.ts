// A stand-in for Google's sender SDK, for tests: the parts PRISM uses, driven by the test. Where Google's own code is strict
// (read from its live scripts, 2026-11-25) so is this: one request for a session at a time, a refused second one announced
// as a failed start, STARTED before the promise resolves, and messages only to the listeners of the session they came on.

type Listener = (event: never) => void
type Load = { autoplay: boolean; media: Record<string, unknown> }

export interface FakeCast {
  options: unknown
  requestSession: ReturnType<typeof vi.fn<() => Promise<unknown>>>
  endCurrentSession: ReturnType<typeof vi.fn<(stop: boolean) => void>>
  loadMedia: ReturnType<typeof vi.fn<(request: Load) => Promise<unknown>>>
  sendMessage: ReturnType<typeof vi.fn<(namespace: string, data: unknown) => Promise<unknown>>>
  playOrPause: ReturnType<typeof vi.fn<() => void>>
  sdkReady(ok?: boolean): void
  hideFramework(): void
  showFramework(): void
  /** A blocker let the framework through and stopped the rest of the SDK. */
  hideChromeCast(): void
  castState(state: string): void
  /** The picker was closed without a choice. */
  cancelPicker(): void
  /**
   * A session starts. The TV page answers a new sender with what it is doing: by default nothing (a TV that has just started
   * PRISM); `'silent'` sends nothing.
   */
  sessionStarted(device: string, tv?: { state: string; id?: string; name?: string } | 'silent'): void
  sessionResumed(device: string): void
  sessionEnded(): void
  message(data: unknown): void
  /** What Cast's own media session says for the next session: a player state, or null for none. */
  mediaSession(state: string | null): void
}

export function installFakeCast(): FakeCast {
  const contextListeners = new Map<string, Listener[]>()
  let asking: { resolve: () => void; reject: (why: string) => void } | null = null
  let device = ''
  let current: { listeners: ((namespace: string, text: string) => void)[] } | null = null
  let media: { playerState: string } | null = null

  const emit = (type: string, event: unknown) => contextListeners.get(type)?.forEach((l) => l(event as never))
  const newSession = () => {
    const listeners: ((namespace: string, text: string) => void)[] = []
    return {
      listeners,
      getCastDevice: () => ({ friendlyName: device }),
      addMessageListener: (_namespace: string, l: (namespace: string, text: string) => void) => listeners.push(l),
      loadMedia: (request: never) => fake.loadMedia(request),
      getMediaSession: () => media,
      sendMessage: (namespace: string, data: unknown) => fake.sendMessage(namespace, data),
    }
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
      return {}
    },
    RemotePlayerController: function RemotePlayerController() {
      return { playOrPause: () => fake.playOrPause() }
    },
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
  const castHolder: { framework?: typeof framework } = { framework }
  const chromeHolder: { cast?: unknown } = {
    cast: {
      AutoJoinPolicy: { TAB_AND_ORIGIN_SCOPED: 'tab_and_origin_scoped' },
      Image,
      media: { MediaInfo: Media, LoadRequest, GenericMediaMetadata: class {}, StreamType: { LIVE: 'LIVE', BUFFERED: 'BUFFERED' } },
    },
  }
  vi.stubGlobal('cast', castHolder)
  vi.stubGlobal('chrome', chromeHolder)

  const begin = (state: string) => (name: string) => {
    device = name
    current = newSession()
    emit('session', { sessionState: state })
    asking?.resolve()
    asking = null
  }
  const fake: FakeCast = {
    options: null,
    requestSession: vi.fn<() => Promise<unknown>>(() => {
      if (asking) {
        emit('session', { sessionState: 'START_FAILED' })
        return Promise.reject('Already requesting session')
      }
      return new Promise<void>((resolve, reject) => {
        asking = { resolve, reject }
      })
    }),
    endCurrentSession: vi.fn<(stop: boolean) => void>(),
    loadMedia: vi.fn<(request: Load) => Promise<unknown>>(() => Promise.resolve()),
    sendMessage: vi.fn<(namespace: string, data: unknown) => Promise<unknown>>(() => Promise.resolve()),
    playOrPause: vi.fn<() => void>(),
    sdkReady: (ok = true) => (window as unknown as { __onGCastApiAvailable?: (ok: boolean) => void }).__onGCastApiAvailable?.(ok),
    hideFramework: () => {
      delete castHolder.framework
    },
    showFramework: () => {
      castHolder.framework = framework
    },
    hideChromeCast: () => {
      delete chromeHolder.cast
    },
    castState: (state) => emit('cast', { castState: state }),
    cancelPicker: () => {
      asking?.reject('cancel')
      asking = null
    },
    sessionStarted: (name, tv = { state: 'idle' }) => {
      begin('STARTED')(name)
      if (tv !== 'silent') fake.message({ v: 1, type: 'now', id: tv.id ?? null, name: tv.name ?? '', state: tv.state })
    },
    sessionResumed: begin('RESUMED'),
    sessionEnded: () => {
      current = null
      emit('session', { sessionState: 'ENDED' })
    },
    message: (data) => current?.listeners.forEach((l) => l('ns', JSON.stringify(data))),
    mediaSession: (state) => {
      media = state === null ? null : { playerState: state }
    },
  }
  return fake
}
