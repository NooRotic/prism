import type { StreamKind } from './urlDetection'

/** The reserved `/hls-dash/:id` for a pasted address: no demo entry may use this id. */
export const CUSTOM_STREAM_ID = 'custom'

/**
 * The player page for a pasted stream address. `as` forces how the player treats it, for
 * links whose text gives no hint (`.../playlist`).
 */
export function buildStreamPath(url: string, as?: StreamKind): string {
  const base = `/hls-dash/${CUSTOM_STREAM_ID}?url=${encodeURIComponent(url)}`
  return as ? `${base}&as=${as}` : base
}

/**
 * A page that plays a video: `/twitch/:channel`, `/youtube/:id`, `/hls-dash/:id`.
 * The listing pages (`/twitch`, `/youtube`, `/hls-dash`) are not.
 */
export function isPlayerPagePath(pathname: string): boolean {
  return /^\/(twitch|youtube|hls-dash)\//.test(pathname)
}
