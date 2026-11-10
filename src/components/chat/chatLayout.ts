import { STORAGE_KEYS } from '../../config/storageKeys'
import type { DockSide } from './chatPlacement'

export const DEFAULT_RATIO = 0.8 // 80% player, 20% chat
export const MIN_RATIO = 0.5
export const MAX_RATIO = 0.92

/** The player's share of the row, from storage; the default when missing or out of range. */
export function loadRatio(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_RATIO
  let stored: string | null
  try {
    stored = localStorage.getItem(STORAGE_KEYS.LOCAL_PANEL_RATIO)
  } catch {
    return DEFAULT_RATIO
  }
  if (!stored) return DEFAULT_RATIO
  const val = parseFloat(stored)
  if (isNaN(val) || val < MIN_RATIO || val > MAX_RATIO) return DEFAULT_RATIO
  return val
}

/** Used when the page does not define `--header-height`. Matches the value in index.css. */
const HEADER_HEIGHT_FALLBACK_PX = 56

/** The chat height the viewer dragged to while the video floats, in px; 0 means the default. */
export function loadFloatingHeight(): number {
  if (typeof localStorage === 'undefined') return 0
  let stored: string | null
  try {
    stored = localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)
  } catch {
    return 0
  }
  const val = parseFloat(stored ?? '')
  return Number.isFinite(val) && val > 0 ? val : 0
}

/** Remembers the dragged height. 0 (the default) removes the entry rather than storing it. */
export function storeFloatingHeight(px: number): void {
  try {
    if (px > 0) localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, String(Math.round(px)))
    else localStorage.removeItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)
  } catch {
    // storage full or unavailable — the height still holds for this session
  }
}

/** The most the chat can grow to: the window below the header, in px. */
export function availableChatHeight(): number {
  const header = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height'),
  )
  return window.innerHeight - (Number.isFinite(header) ? header : HEADER_HEIGHT_FALLBACK_PX)
}

/**
 * The chat's height after a drag of `deltaY` px from `current`: whole pixels, never
 * below 0 and never past `available`.
 */
export function nextFloatingHeight(current: number, deltaY: number, available: number): number {
  return Math.round(Math.min(Math.max(0, available), Math.max(0, current + deltaY)))
}

/**
 * The CSS for a dragged height. The `min()` keeps a height remembered on a bigger window
 * from running off the bottom of a smaller one.
 */
export function floatingHeightCss(px: number): string {
  return `min(${px}px, calc(100vh - var(--header-height)))`
}

/** Which side of the page a dragged chat should dock to: the half the pointer is in. */
export function sideForPoint(clientX: number, viewportWidth: number): DockSide {
  return clientX < viewportWidth / 2 ? 'left' : 'right'
}

/**
 * The player's share after a drag of `deltaX` px. Dragging right grows the
 * player when the chat is on the right, and shrinks it when the chat is on the
 * left (the handle sits between them, so the sign flips with the side).
 */
export function nextRatio(
  prev: number,
  deltaX: number,
  containerWidth: number,
  side: DockSide,
): number {
  if (containerWidth === 0) return prev
  const delta = (side === 'right' ? deltaX : -deltaX) / containerWidth
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, prev + delta))
}
