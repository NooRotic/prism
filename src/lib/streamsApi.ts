import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'

/** One listed stream, as the history server's visitor snapshot describes it (GET /api/streams). */
export interface StreamEntry {
  /** The short public id used in page addresses: `/hls-dash/<id>`. */
  id: string
  name: string
  /** Indexes into the snapshot's `groups`. */
  groups: number[]
  /** A lower-case flag code (`us`, `gb`), or null. */
  country: string | null
  /** The file name of PRISM's own copy of the channel picture (see `logoUrl`), or null. */
  logo: string | null
  kind: 'hls' | 'dash'
  pinned: boolean
  /** `new` means not checked yet. */
  state: 'new' | 'working' | 'suspect'
  /** The stream's address. It can carry a token, so the page shows its host only. */
  url: string
}

export interface StreamSnapshot {
  /** When the server wrote the list (ISO, UTC). */
  generated: string
  defaultId: string | null
  groups: string[]
  streams: StreamEntry[]
}

/** `unavailable`: no usable answer (switched off, down, slow, not ready yet, or a shape this code does not understand). */
export type SnapshotResult = { kind: 'ready'; snapshot: StreamSnapshot } | { kind: 'unavailable' }

const REQUEST_TIMEOUT_MS = 10_000
const UNAVAILABLE: SnapshotResult = { kind: 'unavailable' }
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const LOGO_FILE = /^[0-9a-f]{12}\.(png|jpg|gif|webp)$/
const COUNTRY = /^[a-z]{2}$/

const rec = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function isHttpAddress(text: string): boolean {
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function parseStream(raw: unknown, groupCount: number): StreamEntry | null {
  const s = rec(raw)
  if (!s) return null
  const id = str(s.i)
  const name = str(s.n)
  const url = str(s.u)
  if (id === null || !ID_PATTERN.test(id) || name === null || url === null || !isHttpAddress(url)) return null
  if (s.k !== 'hls' && s.k !== 'dash') return null
  if (s.s !== 'new' && s.s !== 'working' && s.s !== 'suspect') return null
  if (!Array.isArray(s.g)) return null
  const groups: number[] = []
  for (const index of s.g) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= groupCount) return null
    groups.push(index)
  }
  // Cosmetic fields: one that is unusable costs that stream its flag or picture, not the whole list.
  const country = str(s.c)?.toLowerCase() ?? null
  const logo = str(s.l)
  return {
    id,
    name,
    groups,
    country: country !== null && COUNTRY.test(country) ? country : null,
    logo,
    kind: s.k,
    pinned: s.p === 1 || s.p === true,
    state: s.s,
    url,
  }
}

/** Maps the server's compact JSON to a StreamSnapshot; null when it is not that shape (or not version 1). */
export function parseSnapshot(json: unknown): StreamSnapshot | null {
  const root = rec(json)
  if (!root || root.v !== 1) return null
  const generated = str(root.generated)
  if (generated === null || !Array.isArray(root.groups) || !Array.isArray(root.streams)) return null
  if (root.default !== undefined && root.default !== null && typeof root.default !== 'string') return null

  const groups: string[] = []
  for (const group of root.groups) {
    if (typeof group !== 'string') return null
    groups.push(group)
  }
  const streams: StreamEntry[] = []
  for (const raw of root.streams) {
    const stream = parseStream(raw, groups.length)
    if (stream === null) return null
    streams.push(stream)
  }

  return { generated, defaultId: typeof root.default === 'string' ? root.default : null, groups, streams }
}

let cached: SnapshotResult | null = null
let inflight: Promise<SnapshotResult> | null = null
let generation = 0

/** Forgets the remembered list and any request in flight. For tests. */
export function resetSnapshotCache(): void {
  cached = null
  inflight = null
  generation += 1
}

async function request(): Promise<SnapshotResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    // A plain request: no custom headers and no credentials, so the browser sends no preflight.
    const response = await fetch(`${HISTORY_API_URL}/api/streams`, {
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) return UNAVAILABLE
    const snapshot = parseSnapshot(await response.json())
    return snapshot === null ? UNAVAILABLE : { kind: 'ready', snapshot }
  } catch {
    return UNAVAILABLE
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The visitor stream list. Never throws. One request is shared by every caller that asks while it is in flight, a good
 * answer is remembered for the page session, and a failure is not (the next page that wants the list tries again).
 * A caller's own signal only ends that caller's wait: the request itself carries on and keeps its answer for the next.
 */
export function loadStreamSnapshot(signal?: AbortSignal): Promise<SnapshotResult> {
  if (!HISTORY_ENABLED || signal?.aborted) return Promise.resolve(UNAVAILABLE)
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    const mine = generation
    inflight = request().then((result) => {
      if (mine === generation) {
        inflight = null
        if (result.kind === 'ready') cached = result
      }
      return result
    })
  }
  const shared = inflight
  if (!signal) return shared
  return new Promise<SnapshotResult>((resolve) => {
    const onAbort = () => resolve(UNAVAILABLE)
    signal.addEventListener('abort', onAbort, { once: true })
    void shared.then((result) => {
      signal.removeEventListener('abort', onAbort)
      resolve(result)
    })
  })
}

/** The address of PRISM's own copy of a channel picture, only for the file names the server writes; otherwise null. */
export function logoUrl(file: string): string | null {
  if (!HISTORY_ENABLED || !LOGO_FILE.test(file)) return null
  return `${HISTORY_API_URL}/logos/${file}`
}
