import { STORAGE_KEYS } from '../../config/storageKeys'
import { getFavorites, subscribeFavorites } from '../favorites'
import { CAST_APP_ID, CAST_NAMESPACE, contentType, parseNow, type CastLoadData, type CastStream, type ContextMessage, type TvState } from './messages'

export interface CastView {
  /** A device that can run PRISM's TV page was found. */
  available: boolean
  /** A cast was asked for and the TV has not answered yet. */
  connecting: boolean
  /** This tab was casting before a reload, and it is not known yet whether the TV is still there. */
  rejoining: boolean
  connected: boolean
  device: string | null
  now: { id: string | null; name: string; state: TvState } | null
  /** The last cast ended without Stop being pressed on this page: the computer stays quiet until asked. */
  endedBySelf: boolean
  /** The channel the TV was on when Stop was pressed here. */
  stoppedOn: string | null
}

/** What to play on the TV, and the group the page was showing. */
export interface CastChoice {
  stream: CastStream
  group: string | null
}

export interface CastSender {
  load(): void
  start(stream: CastStream, group: string | null): void
  tune(stream: CastStream, group: string | null): void
  togglePause(): void
  stop(): void
  clearEnded(): void
  /** What the page would cast, for a cast that Chrome's own menu starts; null takes the offer back. */
  offer(choice: (() => CastChoice | null) | null): void
  view(): CastView
  subscribe(listener: () => void): () => void
}

export const NO_CAST: CastView = { available: false, connecting: false, rejoining: false, connected: false, device: null, now: null, endedBySelf: false, stoppedOn: null }

const SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
const FRAMEWORK_TRIES = 50
const FRAMEWORK_WAIT_MS = 100
/** How long a reloaded page waits for its TV before it plays by itself. */
const REJOIN_MS = 5_000
/** A Stop that has not ended the session by now did not work (Google's SDK says nothing about it). */
const STOP_MS = 10_000
/**
 * How long a page that joins a TV waits for it to say what it is doing; a TV that says nothing is taken as having nothing on.
 * The TV says it as a sender connects and again 1.5 s later (the first can be missed); this leaves room for a slow second.
 */
export const JOIN_WAIT_MS = 4_000
/** What the TV says while a channel is on: a page that joins then leaves it alone. */
const ON_THE_TV: ReadonlySet<TvState> = new Set<TvState>(['tuning', 'playing', 'buffering', 'paused'])

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

const sdkWindow = () => window as unknown as { chrome?: { cast?: unknown }; cast?: { framework?: unknown }; __onGCastApiAvailable?: (ok: boolean) => void }

/** PRISM's side of a cast. Google's script is fetched only when `load` is called, or in a tab that was already casting. */
export function createCastSender(): CastSender {
  let view: CastView = NO_CAST
  let asked = false
  let context: cast.framework.CastContext | null = null
  let session: cast.framework.CastSession | null = null
  let controller: cast.framework.RemotePlayerController | null = null
  /** The page's stream, from its Cast button: it goes to the TV only if the TV has nothing on. */
  let startedWith: CastChoice | null = null
  /** A card or an address picked while the TV is asked for or looked for again: that one goes to the TV whatever it is doing. */
  let picked: CastChoice | null = null
  /** The page's stream, waiting to hear whether the TV has something on. */
  let joining: { choice: CastChoice; timer: ReturnType<typeof setTimeout> } | null = null
  let offered: (() => CastChoice | null) | null = null
  let stopping: ReturnType<typeof setTimeout> | null = null
  let unstar: (() => void) | null = null
  const listeners = new Set<() => void>()

  function set(change: Partial<CastView>): void {
    const keys = Object.keys(change) as (keyof CastView)[]
    if (keys.every((key) => view[key] === change[key])) return
    view = { ...view, ...change }
    for (const listener of [...listeners]) listener()
  }

  function loadOnTv({ stream, group }: CastChoice): void {
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
    active.addMessageListener(CAST_NAMESPACE, (_namespace, text) => {
      const message = parseNow(text)
      if (!message || session !== active) return
      set({ now: { id: message.id, name: message.name, state: message.state } })
      if (joining) endJoin(!ON_THE_TV.has(message.state))
    })
    unstar?.()
    unstar = subscribeFavorites(() => {
      const message: ContextMessage = { v: 1, type: 'context', favorites: [...getFavorites()] }
      active.sendMessage(CAST_NAMESPACE, message).catch(() => {})
    })
    markCasting(true)
    set({ connected: true, connecting: false, rejoining: false, device: active.getCastDevice().friendlyName, endedBySelf: false, stoppedOn: null })
  }

  /**
   * The page's own stream, for a TV just joined: sent only if the TV has nothing on. Cast's own media session can say so at
   * once; while its player is idle the TV may still be between two channels, so the TV's own word decides.
   */
  function joinWith(choice: CastChoice): void {
    const media = session?.getMediaSession?.() ?? null
    if (media && media.playerState !== 'IDLE') return
    joining = { choice, timer: setTimeout(() => endJoin(true), JOIN_WAIT_MS) }
  }

  function endJoin(send: boolean): void {
    if (!joining) return
    clearTimeout(joining.timer)
    const { choice } = joining
    joining = null
    if (send) loadOnTv(choice)
  }

  function detach(): void {
    const had = session !== null
    const byStop = stopping !== null
    if (stopping) clearTimeout(stopping)
    stopping = null
    if (joining) clearTimeout(joining.timer)
    joining = null
    session = null
    unstar?.()
    unstar = null
    markCasting(false)
    if (had) set({ connected: false, device: null, now: null, endedBySelf: !byStop, stoppedOn: byStop ? view.stoppedOn : null })
  }

  function init(): void {
    const { framework } = cast
    context = framework.CastContext.getInstance()
    context.setOptions({ receiverApplicationId: CAST_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED })
    controller = new framework.RemotePlayerController(new framework.RemotePlayer())

    const showState = (state: string) => set({ available: state !== framework.CastState.NO_DEVICES_AVAILABLE })
    context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, (event) => {
      if (event.castState !== undefined) showState(event.castState)
    })
    context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
      const S = framework.SessionState
      if (event.sessionState === S.SESSION_STARTED) {
        // A pick always goes. Otherwise the page's stream (from its Cast button, or the open page when Chrome's own menu
        // started the cast) goes only to a TV with nothing on: a phone that joins must not retune a TV someone is watching. A
        // TV that was only found again keeps what it plays.
        const found = view.rejoining
        const pick = picked
        const first = startedWith
        picked = null
        startedWith = null
        attach()
        if (pick) loadOnTv(pick)
        else if (!found) {
          const choice = first ?? offered?.() ?? null
          if (choice) joinWith(choice)
        }
      } else if (event.sessionState === S.SESSION_RESUMED) {
        const pick = picked
        picked = null
        attach()
        if (pick) loadOnTv(pick)
      } else if (event.sessionState === S.SESSION_ENDED) {
        detach()
      }
      // A failed start is heard from the request itself: the SDK also says it of a second request it refuses.
    })
    showState(context.getCastState())
  }

  function waitForFramework(tries: number): void {
    const sdk = sdkWindow()
    if (sdk.cast?.framework && sdk.chrome?.cast) init()
    else if (tries > 0) setTimeout(() => waitForFramework(tries - 1), FRAMEWORK_WAIT_MS)
  }

  /** The TV was not found again. */
  function giveUpRejoining(): void {
    if (!view.rejoining) return
    picked = null
    markCasting(false)
    set({ rejoining: false })
  }

  function load(): void {
    if (asked || typeof sdkWindow().chrome === 'undefined') return
    asked = true
    sdkWindow().__onGCastApiAvailable = (ok) => {
      if (!ok) giveUpRejoining()
      else if (context === null) waitForFramework(FRAMEWORK_TRIES)
    }
    const script = document.createElement('script')
    script.src = SDK
    script.async = true
    script.onerror = giveUpRejoining
    document.head.append(script)
  }

  if (wasCasting() && typeof sdkWindow().chrome !== 'undefined') {
    view = { ...view, rejoining: true }
    setTimeout(giveUpRejoining, REJOIN_MS)
    load()
  }

  return {
    load,
    start(stream, group) {
      if (!context) return
      startedWith = { stream, group }
      if (view.connecting) return // the picker is open already: it will cast this one
      set({ connecting: true })
      const done = () => set({ connecting: false })
      context.requestSession().then(done, () => {
        // The picker was closed, or the TV did not answer.
        startedWith = null
        picked = null
        done()
      })
    },
    tune(stream, group) {
      if (stopping) {
        set({ stoppedOn: null }) // the TV is on its way out: what was picked plays here instead
      } else if (session) {
        if (joining) {
          clearTimeout(joining.timer)
          joining = null
        }
        loadOnTv({ stream, group })
      } else if (view.connecting || view.rejoining) {
        picked = { stream, group }
      }
    },
    togglePause() {
      controller?.playOrPause()
    },
    stop() {
      if (!session || !context) return
      if (stopping) clearTimeout(stopping)
      stopping = setTimeout(() => {
        stopping = null
        set({ stoppedOn: null })
      }, STOP_MS)
      set({ stoppedOn: view.now?.id ?? null })
      context.endCurrentSession(true)
    },
    clearEnded() {
      set({ endedBySelf: false, stoppedOn: null })
    },
    offer(choice) {
      offered = choice
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
