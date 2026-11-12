import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'

/** How the server describes TwitchTracker's answer for a channel. `pending` and `none` are only ever overall statuses. */
export type HistoryTtStatus = 'ok' | 'untracked' | 'error' | 'pending' | 'none'

/**
 * One day of a channel's history. avgViewers, maxViewers, hoursWatched and minutesStreamed are TwitchTracker's
 * trailing 30-day figures as of that day, not figures for the day itself; only followersTotal and rank are
 * point-in-time. A number the server did not have is null, never 0.
 */
export interface HistoryRow {
  /** UTC date, `YYYY-MM-DD`. */
  date: string
  rank: number | null
  minutesStreamed: number | null
  avgViewers: number | null
  maxViewers: number | null
  hoursWatched: number | null
  /** Net follower change over TwitchTracker's 30 days; negative when the channel lost followers. */
  followersChange: number | null
  followersTotal: number | null
  ttStatus: 'ok' | 'untracked' | 'error'
}

export interface ChannelHistory {
  login: string
  displayName: string
  avatarUrl: string | null
  broadcasterType: string
  language: string | null
  category: string | null
  /** UTC date the server started tracking the channel, `YYYY-MM-DD`. */
  trackedSince: string
  /** When the newest good TwitchTracker answer was fetched (ISO, UTC), or null. */
  lastUpdated: string | null
  ttStatus: HistoryTtStatus
  bioLinks: { platform: 'youtube' | 'kick'; url: string }[]
  /** The newest answer that was not an error, or null when there is none. */
  latest: HistoryRow | null
  /** Oldest first. */
  history: HistoryRow[]
}

/**
 * `tracked`: the server knows the channel. `untracked`: it answered that it does not track it (not a real
 * channel, blocked, or its new-channel cap is full). `unavailable`: no usable answer (switched off, down,
 * slow, or an answer this code does not understand). The page treats the last two alike: it shows nothing.
 */
export type HistoryResult = { kind: 'tracked'; data: ChannelHistory } | { kind: 'untracked' } | { kind: 'unavailable' }

const LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/
const REQUEST_TIMEOUT_MS = 10_000
const UNAVAILABLE: HistoryResult = { kind: 'unavailable' }
const UNTRACKED: HistoryResult = { kind: 'untracked' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function parseRow(raw: unknown): HistoryRow | null {
  if (!isRecord(raw) || typeof raw.date !== 'string') return null
  return {
    date: raw.date,
    rank: numberOrNull(raw.rank),
    minutesStreamed: numberOrNull(raw.minutes_streamed),
    avgViewers: numberOrNull(raw.avg_viewers),
    maxViewers: numberOrNull(raw.max_viewers),
    hoursWatched: numberOrNull(raw.hours_watched),
    followersChange: numberOrNull(raw.followers_change),
    followersTotal: numberOrNull(raw.followers_total),
    ttStatus: raw.tt_status === 'ok' || raw.tt_status === 'untracked' ? raw.tt_status : 'error',
  }
}

function parseBioLinks(raw: unknown): ChannelHistory['bioLinks'] {
  if (!Array.isArray(raw)) return []
  const links: ChannelHistory['bioLinks'] = []
  for (const item of raw) {
    if (isRecord(item) && (item.platform === 'youtube' || item.platform === 'kick') && typeof item.url === 'string') {
      links.push({ platform: item.platform, url: item.url })
    }
  }
  return links
}

/** Maps the server's JSON for a tracked channel to a ChannelHistory; null when it is not that shape. */
export function parseChannelHistory(json: unknown): ChannelHistory | null {
  if (!isRecord(json) || json.tracked !== true) return null
  if (typeof json.login !== 'string' || typeof json.tracked_since !== 'string' || !Array.isArray(json.history)) return null

  const history: HistoryRow[] = []
  for (const raw of json.history) {
    const row = parseRow(raw)
    if (row === null) return null
    history.push(row)
  }
  const latest = json.latest === null || json.latest === undefined ? null : parseRow(json.latest)
  if (json.latest !== null && json.latest !== undefined && latest === null) return null

  const status = json.tt_status
  const ttStatus: HistoryTtStatus =
    status === 'ok' || status === 'untracked' || status === 'error' || status === 'pending' || status === 'none' ? status : 'none'

  return {
    login: json.login,
    displayName: textOrNull(json.display_name) ?? json.login,
    avatarUrl: textOrNull(json.avatar_url),
    broadcasterType: typeof json.broadcaster_type === 'string' ? json.broadcaster_type : '',
    language: textOrNull(json.language),
    category: textOrNull(json.category),
    trackedSince: json.tracked_since,
    lastUpdated: textOrNull(json.last_updated),
    ttStatus,
    bioLinks: parseBioLinks(json.bio_links),
    latest,
    history,
  }
}

async function call(url: string, init: RequestInit, signal?: AbortSignal): Promise<HistoryResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    if (signal?.aborted) return UNAVAILABLE
    // No custom headers and no credentials: a plain request, so the browser sends no preflight.
    const response = await fetch(url, { ...init, credentials: 'omit', signal: controller.signal })

    if (response.status === 404) {
      const body: unknown = await response.json().catch(() => null)
      // Only the server's own "not tracked" answer counts; any other 404 is something else being wrong.
      return isRecord(body) && body.tracked === false ? UNTRACKED : UNAVAILABLE
    }
    if (!response.ok) return UNAVAILABLE

    const data = parseChannelHistory(await response.json())
    return data === null ? UNAVAILABLE : { kind: 'tracked', data }
  } catch {
    return UNAVAILABLE
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** The history for a channel. Never throws; a bad login or a switched-off server makes no request. */
export async function fetchChannelHistory(login: string, signal?: AbortSignal): Promise<HistoryResult> {
  if (!HISTORY_ENABLED) return UNAVAILABLE
  if (!LOGIN_PATTERN.test(login)) return UNTRACKED
  return call(`${HISTORY_API_URL}/api/channel?login=${encodeURIComponent(login.toLowerCase())}`, { method: 'GET' }, signal)
}

/**
 * Tells the server a channel was opened, which starts tracking it (and fetches its TwitchTracker numbers on
 * the spot), and returns the same payload as the read. The body is a JSON string sent as plain text, so the
 * browser makes no preflight request.
 */
export async function visitChannel(login: string, signal?: AbortSignal): Promise<HistoryResult> {
  if (!HISTORY_ENABLED) return UNAVAILABLE
  if (!LOGIN_PATTERN.test(login)) return UNTRACKED
  return call(`${HISTORY_API_URL}/api/visit`, { method: 'POST', body: JSON.stringify({ login: login.toLowerCase() }) }, signal)
}

/**
 * What a channel page loads: with `sendVisit`, a visit (falling back to a plain read if the visit could not
 * get an answer); without it, just the read.
 */
export async function loadChannelHistory(
  login: string,
  options: { sendVisit: boolean; signal?: AbortSignal },
): Promise<HistoryResult> {
  if (options.sendVisit) {
    const visited = await visitChannel(login, options.signal)
    if (visited.kind !== 'unavailable') return visited
  }
  return fetchChannelHistory(login, options.signal)
}
