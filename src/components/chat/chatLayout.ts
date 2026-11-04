import { STORAGE_KEYS } from '../../config/storageKeys'
import type { DockSide } from './chatPlacement'

export const DEFAULT_RATIO = 0.8 // 80% player, 20% chat
export const MIN_RATIO = 0.5
export const MAX_RATIO = 0.92

/** The player's share of the row, from storage; the default when missing or out of range. */
export function loadRatio(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_RATIO
  const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_PANEL_RATIO)
  if (!stored) return DEFAULT_RATIO
  const val = parseFloat(stored)
  if (isNaN(val) || val < MIN_RATIO || val > MAX_RATIO) return DEFAULT_RATIO
  return val
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
