import { STORAGE_KEYS } from '../config/storageKeys'

/** Name of the pop-out window (so a second click reuses it) and of the BroadcastChannel. */
export const POPOUT_WINDOW_NAME = 'prism-chat-popout'

/**
 * What the main window and the pop-out say to each other.
 * - `hello`: pop-out → main. "I am alive and showing this channel." Also the reply to `ping`.
 * - `ping`: main → pop-out. "Is a pop-out alive?" Sent on load so a reloaded page can re-attach.
 * - `set-channel`: main → pop-out. The viewer moved to another channel; follow.
 * - `close`: main → pop-out. Close yourself (used when the main page has no window handle).
 * - `closed`: pop-out → main. The window is going away.
 */
export type PopoutMessage =
  | { type: 'hello'; channel: string }
  | { type: 'ping' }
  | { type: 'set-channel'; channel: string }
  | { type: 'close' }
  | { type: 'closed' }

export interface PopoutBus {
  post(msg: PopoutMessage): void
  subscribe(cb: (msg: PopoutMessage) => void): () => void
  close(): void
}

function isPopoutMessage(data: unknown): data is PopoutMessage {
  if (typeof data !== 'object' || data === null) return false
  const { type, channel } = data as Record<string, unknown>
  switch (type) {
    case 'hello':
    case 'set-channel':
      return typeof channel === 'string'
    case 'ping':
    case 'close':
    case 'closed':
      return true
    default:
      return false
  }
}

const noopBus: PopoutBus = {
  post: () => {},
  subscribe: () => () => {},
  close: () => {},
}

/**
 * A bus over `BroadcastChannel`, which needs no `window.opener`. Where it does
 * not exist the pop-out still opens; it just cannot follow channel changes.
 */
export function createPopoutBus(): PopoutBus {
  if (typeof BroadcastChannel === 'undefined') return noopBus
  const channel = new BroadcastChannel(POPOUT_WINDOW_NAME)
  return {
    post: (msg) => channel.postMessage(msg),
    subscribe: (cb) => {
      const handler = (event: MessageEvent) => {
        if (isPopoutMessage(event.data)) cb(event.data)
      }
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
    close: () => channel.close(),
  }
}

/**
 * `width` and `height` are the window's CONTENT area, which is what
 * `window.open`'s width/height features mean; saving the outer size (which
 * includes the frame) would make the window grow by its frame on every reopen.
 * `left` and `top` are the window's position on the screen.
 */
export interface WindowBounds {
  width: number
  height: number
  left: number
  top: number
}

const MIN_WINDOW_SIZE = 200
const DEFAULT_WINDOW_SIZE = { width: 420, height: 720 }
/** A minimized Windows window reports a position of about -32000 on both axes. */
const MINIMIZED_POSITION_LIMIT = -30000

/**
 * Finite numbers, a size of at least 200px, and a position that is not the
 * minimized sentinel. Zero and ordinary negative positions are valid (a second
 * monitor can sit left of or above the main one).
 */
function isValidBounds(bounds: WindowBounds): boolean {
  const { width, height, left, top } = bounds
  return (
    [width, height, left, top].every(Number.isFinite) &&
    width >= MIN_WINDOW_SIZE &&
    height >= MIN_WINDOW_SIZE &&
    left > MINIMIZED_POSITION_LIMIT &&
    top > MINIMIZED_POSITION_LIMIT
  )
}

/**
 * The last size and position the viewer left the pop-out in, or null when none
 * is saved or what is saved cannot be trusted. Zero and negative positions are
 * valid (a second monitor can sit left of or above the main one); non-finite
 * numbers and sizes under 200px are not.
 */
export function loadBounds(): WindowBounds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_POPOUT_BOUNDS)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { width, height, left, top } = value as Record<string, unknown>
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      typeof left !== 'number' ||
      typeof top !== 'number'
    ) {
      return null
    }
    const bounds = { width, height, left, top }
    return isValidBounds(bounds) ? bounds : null
  } catch {
    return null
  }
}

/** Ignores bounds that are not valid, so a bad reading never replaces a good saved one. */
export function saveBounds(bounds: WindowBounds): void {
  if (!isValidBounds(bounds)) return
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_POPOUT_BOUNDS, JSON.stringify(bounds))
  } catch {
    // storage full or unavailable — the window just opens at the default next time
  }
}

/** The `features` argument for `window.open`. `popup=yes` asks for a window, not a tab. */
export function boundsToFeatures(bounds: WindowBounds | null): string {
  if (!bounds) {
    return `popup=yes,width=${DEFAULT_WINDOW_SIZE.width},height=${DEFAULT_WINDOW_SIZE.height}`
  }
  const { width, height, left, top } = bounds
  return `popup=yes,width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)}`
}

/**
 * Where the pop-out window points. One function on purpose: if the PRISM-owned
 * page cannot host Twitch's chat, the fallback is returning Twitch's own
 * pop-out URL from here.
 */
export function buildPopoutUrl(channel: string): string {
  return `/chat/${encodeURIComponent(channel)}`
}
