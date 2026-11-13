import { getDemoById } from '../config/demoContent'
import {
  detectURLType,
  detectURLTypeAs,
  parseStreamKind,
  type StreamKind,
  type URLDetectionResult,
} from './urlDetection'

export interface StreamSource {
  url: string
  detection: URLDetectionResult
  kind: StreamKind
  /** True when the address gave no hint of its type and HLS is only our first attempt. */
  guessedKind: boolean
}

/** True for an absolute http(s) address: the only kind the player fetches and the page links to. */
function isHttpAddress(text: string): boolean {
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The address to play for pasted text, or null when it is not one. Text with spaces is never an
 * address (a game name with a dot in it), and neither is another scheme (`javascript:`, `rtmp:`).
 * A bare `host.tld/path` gets `https://` only when the caller already knows the text names a
 * stream (`allowBare`), so a lone word or name with a dot is not turned into a web address.
 */
export function toStreamAddress(text: string, allowBare: boolean): string | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return isHttpAddress(trimmed) ? trimmed : null
  if (!allowBare || !/^[^/?#]+\.[^/?#]+/.test(trimmed)) return null
  const prefixed = `https://${trimmed}`
  return isHttpAddress(prefixed) ? prefixed : null
}

/**
 * What `/hls-dash/:streamId?url=&as=` asks the HLS/DASH page to play, or null when it is
 * not something this page can play (an unknown demo id, a Twitch or YouTube address, no address).
 * A demo id wins over `?url`; `?as=` forces the type of a pasted address.
 */
export function resolveStreamSource(
  streamId: string | undefined,
  params: URLSearchParams,
): StreamSource | null {
  const demo = streamId ? getDemoById(streamId) : undefined
  const demoUrl = demo && (demo.protocol === 'hls' || demo.protocol === 'dash') ? demo.url : null
  const url = demoUrl ?? params.get('url')
  if (!url || !isHttpAddress(url)) return null

  const detected = detectURLType(url)
  if (detected.type === 'twitch' || detected.type === 'youtube') return null

  // An address whose text names no type stays "guessed" even after the visitor forces one, so the
  // other kinds remain on offer if the first choice does not play.
  const guessedKind = detected.type === 'unknown'
  const forced = demoUrl ? null : parseStreamKind(params.get('as'))
  const kind: StreamKind = forced ?? (detected.type === 'unknown' ? 'hls' : detected.type)

  return { url, detection: detectURLTypeAs(url, kind), kind, guessedKind }
}
