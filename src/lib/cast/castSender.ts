import { STORAGE_KEYS } from '../../config/storageKeys'
import { getFavorites, subscribeFavorites } from '../favorites'
import { logPlayback } from '../playbackLog'
import { CAST_APP_ID, CAST_NAMESPACE, contentType, parseNow, type CastLoadData, type CastStream, type ContextMessage, type TvState } from './messages'

export interface CastView {
  /** A device that can run PRISM's TV page was found. */
  available: boolean
  connected: boolean
  device: string | null
  now: { id: string | null; name: string; state: TvState } | null
  paused: boolean
  /** The last cast ended without Stop being pressed on this page: the computer stays quiet until asked. */
  endedBySelf: boolean
  /** The channel the TV was on when Stop was pressed here. */
  stoppedOn: string | null
}

export interface CastSender {
  load(): void
  start(stream: CastStream, group: string | null): void
  tune(stream: CastStream, group: string | null): void
  togglePause(): void
  stop(): void
  clearEnded(): void
  view(): CastView
  subscribe(listener: () => void): () => void
}

export const NO_CAST: CastView = { available: false, connected: false, device: null, now: null, paused: false, endedBySelf: false, stoppedOn: null }

const SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
const FRAMEWORK_TRIES = 50
const FRAMEWORK_WAIT_MS = 100

function markCasting(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    else sessionStorage.removeItem(STORAGE_KEYS.SESSION_CASTING)
  } catch {
    /* storage blocked: a reload simply does not take the session up again */
  }
}

function wasCasting(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.SESSION_CASTING) !== null
  } catch {
    return false
  }
}

const sdkWindow = () => window as unknown as { chrome?: unknown; cast?: { framework?: unknown }; __onGCastApiAvailable?: (ok: boolean) => void }

/** PRISM's side of a cast. Google's script is fetched only when `load` is called, or in a tab that was already casting. */
export function createCastSender(): CastSender {
  let view: CastView = NO_CAST
  let asked = false
  let context: cast.framework.CastContext | null = null
  let session: cast.framework.CastSession | null = null
  let controller: cast.framework.RemotePlayerController | null = null
  let waiting: { stream: CastStream; group: string | null } | null = null
  let stopping = false
  let unstar: (() => void) | null = null
  const listeners = new Set<() => void>()

  function set(change: Partial<CastView>): void {
    const keys = Object.keys(change) as (keyof CastView)[]
    if (keys.every((key) => view[key] === change[key])) return
    view = { ...view, ...change }
    for (const listener of [...listeners]) listener()
  }

  function loadOnTv({ stream, group }: { stream: CastStream; group: string | null }): void {
    if (!session) return
    const media = new chrome.cast.media.MediaInfo(stream.id ?? 'pasted', contentType(stream.kind))
    media.contentUrl = stream.url
    media.streamType = stream.live ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED
    const metadata = new chrome.cast.media.GenericMediaMetadata()
    metadata.title = stream.name
    if (stream.logo !== null) metadata.images = [new chrome.cast.Image(stream.logo)]
    media.metadata = metadata
    const data: CastLoadData = { v: 1, id: stream.id, kind: stream.kind, live: stream.live, favorites: [...getFavorites()], group }
    media.customData = data
    const request = new chrome.cast.media.LoadRequest(media)
    request.autoplay = true
    // A refused load is shown on the TV, and comes back as its state.
    session.loadMedia(request).catch(() => {})
  }

  function attach(): void {
    const active = context?.getCurrentSession() ?? null
    if (!active) return
    session = active
    const device = active.getCastDevice().friendlyName
    active.addMessageListener(CAST_NAMESPACE, (_namespace, text) => {
      const message = parseNow(text)
      if (message && session === active) set({ now: { id: message.id, name: message.name, state: message.state } })
    })
    unstar?.()
    unstar = subscribeFavorites(() => {
      const message: ContextMessage = { v: 1, type: 'context', favorites: [...getFavorites()] }
      active.sendMessage(CAST_NAMESPACE, message).catch(() => {})
    })
    markCasting(true)
    logPlayback('info', 'cast', `casting to ${device}`)
    set({ connected: true, device, endedBySelf: false, stoppedOn: null })
  }

  function detach(): void {
    const had = session !== null
    session = null
    unstar?.()
    unstar = null
    markCasting(false)
    if (!had) return
    logPlayback('info', 'cast', 'casting ended')
    set({ connected: false, device: null, now: null, paused: false, endedBySelf: !stopping, stoppedOn: stopping ? view.stoppedOn : null })
    stopping = false
  }

  function init(): void {
    const { framework } = cast
    context = framework.CastContext.getInstance()
    context.setOptions({ receiverApplicationId: CAST_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED })
    const player = new framework.RemotePlayer()
    controller = new framework.RemotePlayerController(player)
    controller.addEventListener(framework.RemotePlayerEventType.IS_PAUSED_CHANGED, () => set({ paused: view.connected && player.isPaused }))

    const showState = (state: string) => set({ available: state !== framework.CastState.NO_DEVICES_AVAILABLE })
    context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, (event) => {
      if (event.castState !== undefined) showState(event.castState)
    })
    context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
      const S = framework.SessionState
      if (event.sessionState === S.SESSION_STARTED) {
        attach()
        if (waiting) loadOnTv(waiting)
        waiting = null
      } else if (event.sessionState === S.SESSION_RESUMED) {
        attach()
      } else if (event.sessionState === S.SESSION_ENDED) {
        detach()
      } else if (event.sessionState === S.SESSION_START_FAILED) {
        waiting = null
      }
    })
    showState(context.getCastState())
  }

  function waitForFramework(tries: number): void {
    if (sdkWindow().cast?.framework) init()
    else if (tries > 0) setTimeout(() => waitForFramework(tries - 1), FRAMEWORK_WAIT_MS)
  }

  function load(): void {
    if (asked || typeof sdkWindow().chrome === 'undefined') return
    asked = true
    sdkWindow().__onGCastApiAvailable = (ok) => {
      if (ok && context === null) waitForFramework(FRAMEWORK_TRIES)
    }
    const script = document.createElement('script')
    script.src = SDK
    script.async = true
    document.head.append(script)
  }

  if (wasCasting()) load()

  return {
    load,
    start(stream, group) {
      if (!context) return
      waiting = { stream, group }
      context.requestSession().catch(() => {
        waiting = null // the picker was closed
      })
    },
    tune(stream, group) {
      loadOnTv({ stream, group })
    },
    togglePause() {
      controller?.playOrPause()
    },
    stop() {
      if (!session || !context) return
      stopping = true
      set({ stoppedOn: view.now?.id ?? null })
      context.endCurrentSession(true)
    },
    clearEnded() {
      set({ endedBySelf: false, stoppedOn: null })
    },
    view: () => view,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
