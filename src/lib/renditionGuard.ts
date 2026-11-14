import { setAvoidedFormats } from './playbackLog'

/** How many times one stream may be reloaded after a decode failure before the player gives up as it always did. */
export const MAX_RECOVERIES = 2

const FAMILY_BY_PREFIX: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(avc1|avc3)\b/i, 'avc'],
  [/^(hvc1|hev1)\b/i, 'hevc'],
  [/^(dvh1|dvhe)\b/i, 'dolby-vision'],
  [/^av01\b/i, 'av1'],
  [/^vp0?9\b/i, 'vp9'],
]

/** The video format of a CODECS string (`avc1.64001f,mp4a.40.2` is `avc`), or null when it names none we know. */
export function videoFamily(codecs: string | undefined): string | null {
  if (!codecs) return null
  for (const token of codecs.split(',')) {
    const codec = token.trim()
    for (const [pattern, family] of FAMILY_BY_PREFIX) if (pattern.test(codec)) return family
  }
  return null
}

const avoided = new Set<string>()

/** From now on this page asks Video.js for no rendition of this video format (until the page is reloaded). */
export function avoidFormat(family: string): void {
  avoided.add(family)
  setAvoidedFormats([...avoided])
}

export function avoidedFormats(): readonly string[] {
  return [...avoided]
}

export function resetAvoidedFormats(): void {
  avoided.clear()
  setAvoidedFormats([])
}

interface RenditionLike {
  attributes?: { CODECS?: string }
  disabled?: boolean
}

/**
 * Turns off (Video.js's own `disabled` flag, which both of its selectors honour) every rendition of an avoided format.
 * Returns how many it turned off. It only does so while a rendition with a known video format of another kind stays on:
 * a stream that has nothing else (or only audio-only or codec-less renditions, which would play sound over a black frame)
 * is left alone, so the player still has something to try.
 */
export function markAvoidedRenditions(playlists: ReadonlyArray<RenditionLike> | undefined): number {
  if (!playlists || avoided.size === 0) return 0
  const available = playlists.filter((item) => !item.disabled)
  const toTurnOff = available.filter((item) => {
    const family = videoFamily(item.attributes?.CODECS)
    return family !== null && avoided.has(family)
  })
  if (toTurnOff.length === 0) return 0
  const staysOn = available.some((item) => {
    const family = videoFamily(item.attributes?.CODECS)
    return family !== null && !avoided.has(family)
  })
  if (!staysOn) return 0
  for (const item of toTurnOff) item.disabled = true
  return toTurnOff.length
}

/** True for Video.js's own words for a video segment it could not append: `video append of 56283b failed for segment #0 in playlist <id>`. */
export function isVideoAppendFailure(message: string | undefined): boolean {
  return message !== undefined && /^video append of \d+b failed\b/i.test(message)
}

/** The playlist id a Video.js append failure names (`... in playlist <id>`), or null. */
export function failingPlaylistId(message: string | undefined): string | null {
  const match = message === undefined ? null : / in playlist (.+)$/.exec(message)
  return match ? match[1] : null
}

export type RecoveryPlan = { retry: true; family: string } | { retry: false; reason: string }

/**
 * What to do when Video.js reports an error: if it is a failed append of a VIDEO segment (code 3 is also what Video.js
 * says for "no working playlist", failed audio appends and encrypted-media failures, none of which a different video
 * format would fix), reload while avoiding the video format that failed, provided that format is not H.264 (everything
 * falls back to it), the stream has a rendition of another format that is not itself avoided, and the recoveries are not
 * used up.
 */
export function planDecodeRecovery(input: {
  code: number | undefined
  /** Video.js's error message: it says which kind of segment failed. */
  message: string | undefined
  /** How many recoveries this stream has had already. */
  attempts: number
  failingCodecs: string | undefined
  playlistCodecs: ReadonlyArray<string | undefined>
}): RecoveryPlan {
  const { code, message, attempts, failingCodecs, playlistCodecs } = input
  if (code !== 3) return { retry: false, reason: `error code ${code ?? 'unknown'} is not a decode failure` }
  if (!isVideoAppendFailure(message)) return { retry: false, reason: 'the error is not a failed append of a video segment' }
  if (attempts >= MAX_RECOVERIES) return { retry: false, reason: `already reloaded ${MAX_RECOVERIES} times` }
  const family = videoFamily(failingCodecs)
  if (family === null) return { retry: false, reason: 'the failing rendition names no video format we know' }
  if (family === 'avc') return { retry: false, reason: 'H.264 is the format every other one falls back to' }
  if (avoided.has(family)) return { retry: false, reason: `${family} is already avoided` }
  const alternative = playlistCodecs.some((codecs) => {
    const other = videoFamily(codecs)
    return other !== null && other !== family && !avoided.has(other)
  })
  if (!alternative) return { retry: false, reason: `the stream has no rendition of another video format than ${family}` }
  return { retry: true, family }
}

const patched = new WeakSet<object>()
const SELECTORS = ['STANDARD_PLAYLIST_SELECTOR', 'INITIAL_PLAYLIST_SELECTOR'] as const
let installed = false

/** True once the selectors of Video.js have been wrapped on this page: the debug output says so, because a Video.js upgrade could end it silently. */
export function isRenditionGuardInstalled(): boolean {
  return installed
}

/**
 * Wraps Video.js's two rendition selectors, once, so each turns off the avoided renditions before it picks. Returns false
 * (and changes nothing) when `Vhs` or its selectors are not there, as in tests that stand in for Video.js.
 */
export function installRenditionGuard(vjs: unknown): boolean {
  const vhs = (vjs as { Vhs?: Record<string, unknown> } | null | undefined)?.Vhs
  if (!vhs || typeof vhs !== 'object') return false
  if (patched.has(vhs)) {
    installed = true
    return true
  }
  let wrapped = 0
  for (const key of SELECTORS) {
    const original = vhs[key]
    if (typeof original !== 'function') continue
    vhs[key] = function (this: { playlists?: { main?: { playlists?: ReadonlyArray<RenditionLike> } } } | undefined, ...args: unknown[]) {
      try {
        markAvoidedRenditions(this?.playlists?.main?.playlists)
      } catch {
        // The guard must never be the reason a rendition cannot be picked.
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
    wrapped++
  }
  if (wrapped === 0) return false
  patched.add(vhs)
  installed = true
  return true
}
