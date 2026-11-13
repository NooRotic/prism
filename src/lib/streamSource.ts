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
  if (!url) return null

  const detected = detectURLType(url)
  if (detected.type === 'twitch' || detected.type === 'youtube') return null

  // An address whose text names no type stays "guessed" even after the visitor forces one, so the
  // other kinds remain on offer if the first choice does not play.
  const guessedKind = detected.type === 'unknown'
  const forced = demoUrl ? null : parseStreamKind(params.get('as'))
  const kind: StreamKind = forced ?? (detected.type === 'unknown' ? 'hls' : detected.type)

  return { url, detection: detectURLTypeAs(url, kind), kind, guessedKind }
}
