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

/**
 * The first `maxChars` characters of a response body. A guessed-HLS address can be a video file or
 * a stream that never ends, so the body is read chunk by chunk and abandoned once there is enough,
 * rather than downloaded until the timeout and misreported as unreachable.
 */
async function readHead(response: Response, maxChars: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return (await response.text()).slice(0, maxChars)

  const decoder = new TextDecoder()
  let head = ''
  try {
    while (head.length < maxChars) {
      const { done, value } = await reader.read()
      if (done) break
      head += decoder.decode(value, { stream: true })
    }
  } finally {
    void Promise.resolve(reader.cancel()).catch(() => {})
  }
  return head.slice(0, maxChars)
}

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

    const text = await readHead(response, kind === 'hls' ? HLS_HEAD_CHARS : DASH_HEAD_CHARS)
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
