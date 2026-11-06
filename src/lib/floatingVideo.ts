import { matchPath } from 'react-router-dom'
import { STORAGE_KEYS } from '../config/storageKeys'
import type { URLDetectionResult } from './urlDetection'

export interface FloatSize {
  width: number
  height: number
}

/**
 * The size the floating window opens at, and also its floor. Twitch pauses a
 * player in a window that is too small, so a smaller remembered size is never
 * restored (the viewer can still shrink a live window).
 */
export const FLOAT_DEFAULT_SIZE: FloatSize = { width: 480, height: 270 }

/** Each side raised to the default if it is smaller. */
export function clampFloatSize(size: FloatSize): FloatSize {
  return {
    width: Math.max(size.width, FLOAT_DEFAULT_SIZE.width),
    height: Math.max(size.height, FLOAT_DEFAULT_SIZE.height),
  }
}

function isUsableSide(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** The saved size (raised to the floor), or the default. Never throws. */
export function loadFloatSize(): FloatSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_VIDEO_POPOUT_SIZE)
    if (!raw) return { ...FLOAT_DEFAULT_SIZE }
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return { ...FLOAT_DEFAULT_SIZE }
    const { width, height } = value as Record<string, unknown>
    if (!isUsableSide(width) || !isUsableSide(height)) return { ...FLOAT_DEFAULT_SIZE }
    return clampFloatSize({ width, height })
  } catch {
    return { ...FLOAT_DEFAULT_SIZE }
  }
}

/** Stores what the viewer left (the floor is applied on load). Ignores sizes that make no sense. */
export function saveFloatSize(size: FloatSize): void {
  if (!isUsableSide(size.width) || !isUsableSide(size.height)) return
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_VIDEO_POPOUT_SIZE,
      JSON.stringify({ width: size.width, height: size.height }),
    )
  } catch {
    // storage full or unavailable: the window just opens at the default next time
  }
}

/** Chrome or Edge 116+ on a secure context. Anywhere else the control is not shown. */
export function isFloatingSupported(
  win: Pick<Window, 'isSecureContext' | 'documentPictureInPicture'> = window,
): boolean {
  return win.isSecureContext === true && typeof win.documentPictureInPicture?.requestWindow === 'function'
}

/** The channel of a `/twitch/:channel` address, or null for any other page. */
export function floatingChannelFromPath(pathname: string): string | null {
  return matchPath('/twitch/:channel', pathname)?.params.channel ?? null
}

function isClipOrVod(detection: URLDetectionResult | null): boolean {
  return detection?.platform === 'twitch-clip' || detection?.platform === 'twitch-video'
}

/** True on a live Twitch channel page: the only place the video can be popped out. */
export function canPopOutOn(pathname: string, detection: URLDetectionResult | null): boolean {
  return floatingChannelFromPath(pathname) !== null && detection?.platform === 'twitch-stream'
}

/** Pages that play their own video end the floating window, so two things never play at once. */
const OWN_VIDEO_ROUTES = ['/youtube/:videoId', '/hls-dash/:streamId']

export function floatingShouldEnd(pathname: string, detection: URLDetectionResult | null): boolean {
  if (OWN_VIDEO_ROUTES.some((pattern) => matchPath(pattern, pathname) !== null)) return true
  return floatingChannelFromPath(pathname) !== null && isClipOrVod(detection)
}
