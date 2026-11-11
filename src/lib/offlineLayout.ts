import { STORAGE_KEYS } from '../config/storageKeys'
import type { TwitchVideo } from '../types/twitch'
import { parseTwitchDuration } from './twitchDuration'

export const OFFLINE_CHAT_WIDTH_DEFAULT = 360
export const OFFLINE_CHAT_WIDTH_MIN = 280
export const OFFLINE_CHAT_WIDTH_MAX = 560

/**
 * A chat width in whole pixels, held between the minimum and the smaller of the maximum and
 * half the container (never below the minimum, whatever the container). A width that is not a
 * number becomes the default.
 */
export function clampChatWidth(px: number, containerWidth: number): number {
  const max = Math.max(
    OFFLINE_CHAT_WIDTH_MIN,
    Math.min(OFFLINE_CHAT_WIDTH_MAX, Math.floor(containerWidth / 2)),
  )
  const wanted = Number.isFinite(px) ? px : OFFLINE_CHAT_WIDTH_DEFAULT
  return Math.round(Math.min(max, Math.max(OFFLINE_CHAT_WIDTH_MIN, wanted)))
}

/** The width the viewer last dragged the chat column to; the default when missing, unreadable or out of range. */
export function loadChatWidth(): number {
  let stored: string | null
  try {
    stored = localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH)
  } catch {
    return OFFLINE_CHAT_WIDTH_DEFAULT
  }
  const value = parseFloat(stored ?? '')
  if (!Number.isFinite(value)) return OFFLINE_CHAT_WIDTH_DEFAULT
  if (value < OFFLINE_CHAT_WIDTH_MIN || value > OFFLINE_CHAT_WIDTH_MAX) return OFFLINE_CHAT_WIDTH_DEFAULT
  return value
}

/** Remembers the dragged width in whole pixels. */
export function storeChatWidth(px: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, String(Math.round(px)))
  } catch {
    // storage full or unavailable: the width still holds for this visit
  }
}

const HOUR_MS = 60 * 60 * 1000

/**
 * When the channel last stopped streaming, in ms, from its recordings: the newest video of type
 * `archive` (highlights and uploads are not broadcasts), its start plus its length. Null when
 * there is none or its start cannot be read.
 */
export function lastStreamedAt(videos: TwitchVideo[]): number | null {
  let end: number | null = null
  let newestStart = -Infinity
  for (const v of videos) {
    if (v.type !== 'archive') continue
    const start = Date.parse(v.created_at)
    if (Number.isNaN(start) || start <= newestStart) continue
    newestStart = start
    end = start + parseTwitchDuration(v.duration) * HOUR_MS
  }
  return end
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", "2 weeks ago", "2 months ago", "1 year ago". */
export function formatAgo(thenMs: number, now: number): string {
  const seconds = Math.floor((now - thenMs) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return plural(hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 14) return plural(days, 'day')
  if (days < 60) return plural(Math.floor(days / 7), 'week')
  if (days < 365) return plural(Math.floor(days / 30), 'month')
  return plural(Math.floor(days / 365), 'year')
}
