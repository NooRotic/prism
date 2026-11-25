import { getHlsDashDemo } from '../../config/demoContent'
import type { StreamSource } from '../streamSource'
import { logoUrl, type StreamEntry } from '../streamsApi'
import type { CastStream } from './messages'

/** Why a stream cannot go to the TV, in words for the button; null when it can. */
export function castReason(source: StreamSource): string | null {
  if (source.kind !== 'hls' && source.kind !== 'dash') return 'Only HLS and DASH streams can be cast'
  if (new URL(source.url).protocol !== 'https:') return 'This address is not secure (https), so a TV cannot play it'
  return null
}

/**
 * The page's stream as the TV plays it. `entry` is its entry in the server's list, if it has one; `finite` says whether the
 * page's own player found an end to it. A listed stream is live; the built-in demos are recordings. A pasted address is named
 * by its host: the rest of it can carry a token.
 */
export function toCastStream(source: StreamSource, entry: StreamEntry | null, finite: boolean): CastStream {
  const demo = getHlsDashDemo().find((item) => item.url === source.url)
  return {
    id: entry?.id ?? null,
    name: entry?.name ?? demo?.label ?? new URL(source.url).host,
    url: source.url,
    kind: source.kind === 'dash' ? 'dash' : 'hls',
    live: demo ? false : entry !== null || !finite,
    logo: entry?.logo ? logoUrl(entry.logo) : null,
  }
}
