import { FLOAT_DEFAULT_SIZE } from './floatingVideo'
import type { FloatSize } from './floatingVideo'

export const START_BUTTON_TEXT = 'Click here to start with sound'
export const PLAYER_HOLDER_ID = 'prism-floating-player'
/** How long the player may take to become ready before the window gives up on it. */
export const READY_TIMEOUT_MS = 15000
/** A resize is reported once the window has stopped changing for this long. */
export const RESIZE_DEBOUNCE_MS = 300

const TWITCH_EMBED_SCRIPT = 'https://embed.twitch.tv/embed/v1.js'

export interface FloatingSession {
  /** Switches the player to another channel. A no-op after close, or for the channel already showing. */
  setChannel(channel: string): void
  /** Closes the window. Safe to call more than once. */
  close(): void
  readonly closed: boolean
}

export interface OpenFloatingOptions {
  channel: string
  /** The main page's hostname; the window's own origin reads "null", so Twitch must be told. */
  parent: string
  size: FloatSize
  /** The window ended, by any route (its X, back-to-tab, the tab reloading, `close()`). Once. */
  onClosed: () => void
  /** The player could not start inside the window. Once. Closing the window is the caller's job. */
  onFailed: () => void
  onResize?: (size: FloatSize) => void
  /** Defaults to `window.documentPictureInPicture.requestWindow`. */
  opener?: (options: { width: number; height: number }) => Promise<Window>
  /** Defaults to adding the Twitch embed script to the window's own document. */
  loadScript?: (win: Window) => Promise<void>
}

/** The slice of the Twitch embed this module touches. */
interface TwitchEmbedLike {
  addEventListener(event: string, callback: () => void): void
  /** The live SDK's player proxy is not always usable yet, so this may throw or return nothing. */
  getPlayer(): { setChannel?: (channel: string) => void; play?: () => void } | undefined
  destroy?: () => void
}

interface TwitchEmbedClass {
  new (elementId: string, options: Record<string, unknown>): TwitchEmbedLike
  VIDEO_READY: string
  VIDEO_PLAY?: string
  ONLINE?: string
  OFFLINE?: string
}

function embedClassOf(win: Window): TwitchEmbedClass | undefined {
  return (win as unknown as { Twitch?: { Embed?: TwitchEmbedClass } }).Twitch?.Embed
}

function defaultOpener(options: { width: number; height: number }): Promise<Window> {
  const api = window.documentPictureInPicture
  if (!api) return Promise.reject(new Error('Floating windows are not supported in this browser'))
  return api.requestWindow(options)
}

/** The window has its own `document` and globals, so the script goes into that document. */
function defaultLoadScript(win: Window): Promise<void> {
  if (embedClassOf(win)) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const script = win.document.createElement('script')
    script.src = TWITCH_EMBED_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load the Twitch Embed SDK in the floating window'))
    win.document.head.appendChild(script)
  })
}

/**
 * Opens the floating (document picture-in-picture) window and runs the player in it.
 *
 * The browser only allows the request inside a click, so the opener is called
 * before anything else happens and nothing is awaited ahead of it. The window
 * first shows a start screen: Chrome only plays sound once the page has been
 * clicked, and a new window has not been, so the player is created after a click
 * inside the window. Everything the player waits on (timers) is the window's
 * own, because the tab that opened it may be hidden and a hidden tab throttles
 * its timers.
 */
export function openFloatingWindow(options: OpenFloatingOptions): Promise<FloatingSession> {
  const opener = options.opener ?? defaultOpener
  const loadScript = options.loadScript ?? defaultLoadScript
  return opener({ width: options.size.width, height: options.size.height }).then((win) => {
    try {
      return buildSession(win, options, loadScript)
    } catch (error) {
      // The browser opened a window that setup could not use: close it, or it would stay open
      // with nothing in the app knowing it exists.
      try {
        win.close()
      } catch {
        // already gone
      }
      throw error
    }
  })
}

function buildSession(
  win: Window,
  options: OpenFloatingOptions,
  loadScript: (win: Window) => Promise<void>,
): FloatingSession {
  const { parent, onClosed, onFailed, onResize } = options
  let currentChannel = options.channel
  let closed = false
  let failed = false
  let started = false
  let embed: TwitchEmbedLike | null = null
  let readyTimer: number | undefined
  let resizeTimer: number | undefined

  const doc = win.document
  doc.title = 'PRISM video'
  const style = doc.createElement('style')
  style.textContent =
    'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
    `#${PLAYER_HOLDER_ID}{position:fixed;inset:0}` +
    `#${PLAYER_HOLDER_ID} iframe{width:100%;height:100%;border:0;display:block}`
  doc.head.appendChild(style)

  const holder = doc.createElement('div')
  holder.id = PLAYER_HOLDER_ID
  doc.body.appendChild(holder)

  const startButton = doc.createElement('button')
  startButton.type = 'button'
  startButton.textContent = START_BUTTON_TEXT
  startButton.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;border:0;cursor:pointer;' +
    'background:#18181b;color:#fff;font:600 18px system-ui,sans-serif'
  holder.appendChild(startButton)

  const clearReadyTimer = () => {
    win.clearTimeout(readyTimer)
    readyTimer = undefined
  }

  const fail = () => {
    if (failed || closed) return
    failed = true
    clearReadyTimer()
    onFailed()
  }

  const createEmbed = () => {
    const Embed = embedClassOf(win)
    if (!Embed) throw new Error('The Twitch Embed SDK is not available in the floating window')
    const instance = new Embed(PLAYER_HOLDER_ID, {
      width: '100%',
      height: '100%',
      channel: currentChannel,
      parent: [parent],
      autoplay: true,
      muted: false,
      layout: 'video',
    })
    // Any sign of life means the player started. VIDEO_READY alone is not enough: Twitch can
    // withhold it behind its own visibility checks, and an offline channel never plays.
    for (const event of [Embed.VIDEO_READY, Embed.VIDEO_PLAY, Embed.ONLINE, Embed.OFFLINE]) {
      if (event) instance.addEventListener(event, clearReadyTimer)
    }
    embed = instance
  }

  /** The window gives up on a player that shows no sign of life, script loading included. */
  const armReadyTimer = () => {
    clearReadyTimer()
    readyTimer = win.setTimeout(fail, READY_TIMEOUT_MS)
  }

  const startPlayer = async () => {
    if (started || closed) return
    started = true
    startButton.remove()
    // Armed before the script is fetched, so a request that stalls fails too.
    armReadyTimer()
    try {
      await loadScript(win)
      if (closed || failed) return
      createEmbed()
    } catch {
      fail()
    }
  }
  startButton.addEventListener('click', () => {
    void startPlayer()
  })

  const handleClosed = () => {
    if (closed) return
    closed = true
    clearReadyTimer()
    win.clearTimeout(resizeTimer)
    onClosed()
  }
  win.addEventListener('pagehide', handleClosed)
  // Closed before it was handed over (the viewer shut it at once): no `pagehide` will come now.
  if (win.closed) handleClosed()

  // Twitch pauses a player in a window that is too small and does not resume it when the window
  // grows back, so a window that grows while it is (or was) below the floor asks the player to
  // play again. A video the viewer had paused on purpose resumes too: enlarging the window to
  // look at it is taken as wanting to watch it.
  let wasTooSmall = false
  let lastArea = win.innerWidth * win.innerHeight
  const resumePlayback = () => {
    if (!embed) return
    try {
      embed.getPlayer()?.play?.()
    } catch {
      // the player is not usable right now; the viewer can still press play in it
    }
  }
  const settleSize = (size: FloatSize) => {
    const area = size.width * size.height
    const tooSmall =
      size.width < FLOAT_DEFAULT_SIZE.width || size.height < FLOAT_DEFAULT_SIZE.height
    if ((wasTooSmall || tooSmall) && area > lastArea) resumePlayback()
    wasTooSmall = tooSmall
    lastArea = area
  }

  win.addEventListener('resize', () => {
    if (closed) return
    win.clearTimeout(resizeTimer)
    resizeTimer = win.setTimeout(() => {
      const size = { width: win.innerWidth, height: win.innerHeight }
      onResize?.(size)
      settleSize(size)
    }, RESIZE_DEBOUNCE_MS)
  })

  return {
    setChannel(next: string) {
      if (closed || next === currentChannel) return
      currentChannel = next
      // Not started yet: the latest channel is the one that starts on the click.
      if (!embed) return
      // This runs from a React effect, so nothing may throw out of it: a player that cannot
      // switch is rebuilt instead.
      try {
        const player = embed.getPlayer()
        if (typeof player?.setChannel === 'function') {
          player.setChannel(next)
          return
        }
      } catch {
        // the SDK's player was not usable: fall through and rebuild
      }
      try {
        embed.destroy?.()
        while (holder.firstChild) holder.removeChild(holder.firstChild)
        createEmbed()
        armReadyTimer()
      } catch {
        fail()
      }
    },
    close() {
      if (closed) return
      win.close()
      // Closing a window fires `pagehide`, which gets here first; this covers a browser that does not.
      handleClosed()
    },
    get closed() {
      return closed
    },
  }
}
