import type { StreamKind } from './urlDetection'

/**
 * What asking a pasted stream address from the visitor's own browser told us. A browser reports
 * "down", "blocked by CORS" and "DNS failed" all as one failed fetch, so `unreachable` cannot
 * say which of them it was.
 */
export type ProbeResult =
  | { kind: 'ok' }
  | { kind: 'http'; status: number }
  | { kind: 'not-playlist' }
  | { kind: 'unreachable' }
  | { kind: 'mixed-content' }

export interface ProbeOptions {
  fetchFn?: typeof fetch
  timeoutMs?: number
  /** `window.location.protocol` of the page; an http address on an https page is blocked outright. */
  pageProtocol?: string
}

const HLS_HEAD_CHARS = 1024
const DASH_HEAD_CHARS = 2048

export async function probeStream(
  url: string,
  kind: StreamKind,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const {
    fetchFn = fetch,
    timeoutMs = 8000,
    pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:',
  } = options

  if (pageProtocol === 'https:' && /^http:/i.test(url.trim())) return { kind: 'mixed-content' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return { kind: 'http', status: response.status }
    if (kind === 'mp4') return { kind: 'ok' }

    const text = await response.text()
    if (kind === 'hls') {
      const head = text.slice(0, HLS_HEAD_CHARS).replace(/^[\u{FEFF}\s]+/u, '')
      return head.startsWith('#EXTM3U') ? { kind: 'ok' } : { kind: 'not-playlist' }
    }
    return text.slice(0, DASH_HEAD_CHARS).toUpperCase().includes('<MPD')
      ? { kind: 'ok' }
      : { kind: 'not-playlist' }
  } catch {
    return { kind: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
