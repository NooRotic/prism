import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'
import { getAdminToken } from './adminAuth'
import { USAGE_SECTIONS, type UsageSection } from './usageSections'

/**
 * The header that carries the admin token. It is `Authorization` unless the live check of the host (plan task 1)
 * found that header does not reach PHP; then it becomes the custom name the server also reads.
 */
export const AUTH_HEADER = 'Authorization'

/** What an admin call came to. Never thrown: the screens branch on `kind`. */
export type AdminResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'signed_out' }
  | { kind: 'refused'; recorded: boolean }
  | { kind: 'busy' }
  | { kind: 'unavailable' }

/** The two actions also tell "that channel does not exist (any more)" from a broken server. */
export type AdminActionResult = AdminResult<{ ok: true }> | { kind: 'not_found' }

/** The only server settings the admin side shows; none of them is a secret. */
export interface AdminLimits {
  ttDayBudget: number
  ttRunBudget: number
  newPerDay: number
  tailDays: number
}
export interface AdminSession {
  limits: AdminLimits
}

export type AttentionCode = 'tt_paused' | 'job_stale' | 'tt_budget_80' | 'named_refused_7d'
const ATTENTION_CODES: readonly string[] = ['tt_paused', 'job_stale', 'tt_budget_80', 'named_refused_7d']

export interface AdminOverview {
  pages: { today: number; yesterday: number }
  /** The last 14 UTC days, oldest first. */
  chart: { date: string; pages: number }[]
  newChannels: { last24h: number }
  tt: { today: number; paused: boolean }
  refused: { named7d: number; signedOutToday: number }
  needsAttention: AttentionCode[]
}

export interface AdminUsage {
  /** Oldest first, every section present on every day. */
  days: { date: string; counts: Record<UsageSection, number> }[]
}

export interface AdminLastRun {
  atMs: number
  stoppedBy: string
  profiles: number
  gone: number
  dormant: number
  ttOk: number
  ttUntracked: number
  ttError: number
  ttSkipped: number
}
export interface AdminTt {
  days: { date: string; calls: number }[]
  /** UTC `Y-m-d H:i:s` when TwitchTracker calls are paused, else null. */
  pausedUntil: string | null
  lastRun: AdminLastRun | null
}

export interface AdminAttempt {
  twitchId: string
  login: string
  firstAttemptAt: string
  lastAttemptAt: string
  attempts: number
  /** True when any attempt was not made through the admin sign-in (a script sent the token). */
  viaScript: boolean
}
export interface AdminAuditRow {
  at: string
  action: string
  target: string
  detail: string
}
export interface AdminSecurity {
  signedOutToday: number
  attempts: AdminAttempt[]
  audit: AdminAuditRow[]
}

export interface AdminChannel {
  twitchId: string
  login: string
  displayName: string
  status: 'tracking' | 'dormant' | 'gone'
  trackedSince: string
  lastVisitedAt: string
  ttStatus: 'ok' | 'untracked' | 'error' | null
}
export interface AdminBlocked {
  twitchId: string
  login: string
  blockedAt: string
}
export interface AdminChannels {
  channels: AdminChannel[]
  blocked: AdminBlocked[]
}

const REQUEST_TIMEOUT_MS = 10_000

/** Raised by the parsers when the server's JSON is not the shape this code expects. */
class ShapeError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function rec(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ShapeError()
  return value
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError()
  return value
}
function num(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ShapeError()
  return value
}
function str(value: unknown): string {
  if (typeof value !== 'string') throw new ShapeError()
  return value
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ShapeError()
  return value
}
function strOrNull(value: unknown): string | null {
  return value === null ? null : str(value)
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new ShapeError()
  return value as T
}

const parseSession = (json: unknown): AdminSession => {
  const limits = rec(rec(json).limits)
  return {
    limits: { ttDayBudget: num(limits.tt_day_budget), ttRunBudget: num(limits.tt_run_budget), newPerDay: num(limits.new_per_day), tailDays: num(limits.tail_days) },
  }
}

const parseOverview = (json: unknown): AdminOverview => {
  const o = rec(json)
  const pages = rec(o.pages)
  const tt = rec(o.tt)
  const refused = rec(o.refused)
  return {
    pages: { today: num(pages.today), yesterday: num(pages.yesterday) },
    chart: list(o.chart).map((d) => ({ date: str(rec(d).date), pages: num(rec(d).pages) })),
    newChannels: { last24h: num(rec(o.new_channels).last_24h) },
    tt: { today: num(tt.today), paused: bool(tt.paused) },
    refused: { named7d: num(refused.named_7d), signedOutToday: num(refused.signed_out_today) },
    needsAttention: list(o.needs_attention).map((c) => oneOf(c, ATTENTION_CODES) as AttentionCode),
  }
}

const parseUsage = (json: unknown): AdminUsage => ({
  days: list(rec(json).days).map((d) => {
    const row = rec(d)
    const counts = {} as Record<UsageSection, number>
    for (const section of USAGE_SECTIONS) counts[section] = num(row[section])
    return { date: str(row.date), counts }
  }),
})

const parseTt = (json: unknown): AdminTt => {
  const o = rec(json)
  const run = o.last_run === null ? null : rec(o.last_run)
  return {
    days: list(o.days).map((d) => ({ date: str(rec(d).date), calls: num(rec(d).calls) })),
    pausedUntil: strOrNull(o.paused_until),
    lastRun:
      run === null
        ? null
        : {
            atMs: num(run.at_ms),
            stoppedBy: str(run.stopped_by),
            profiles: num(run.profiles),
            gone: num(run.gone),
            dormant: num(run.dormant),
            ttOk: num(run.tt_ok),
            ttUntracked: num(run.tt_untracked),
            ttError: num(run.tt_error),
            ttSkipped: num(run.tt_skipped),
          },
  }
}

const parseSecurity = (json: unknown): AdminSecurity => {
  const o = rec(json)
  return {
    signedOutToday: num(o.signed_out_today),
    attempts: list(o.attempts).map((a) => {
      const r = rec(a)
      return {
        twitchId: str(r.twitch_id),
        login: str(r.login),
        firstAttemptAt: str(r.first_attempt_at),
        lastAttemptAt: str(r.last_attempt_at),
        attempts: num(r.attempts),
        viaScript: bool(r.via_script),
      }
    }),
    audit: list(o.audit).map((a) => {
      const r = rec(a)
      return { at: str(r.at), action: str(r.action), target: str(r.target), detail: str(r.detail) }
    }),
  }
}

const parseChannels = (json: unknown): AdminChannels => {
  const o = rec(json)
  return {
    channels: list(o.channels).map((c) => {
      const r = rec(c)
      return {
        twitchId: str(r.twitch_id),
        login: str(r.login),
        displayName: str(r.display_name),
        status: oneOf(r.status, ['tracking', 'dormant', 'gone'] as const),
        trackedSince: str(r.tracked_since),
        lastVisitedAt: str(r.last_visited_at),
        ttStatus: r.tt_status === null ? null : oneOf(r.tt_status, ['ok', 'untracked', 'error'] as const),
      }
    }),
    blocked: list(o.blocked).map((b) => {
      const r = rec(b)
      return { twitchId: str(r.twitch_id), login: str(r.login), blockedAt: str(r.blocked_at) }
    }),
  }
}

const parseOk = (json: unknown): { ok: true } => {
  if (rec(json).ok !== true) throw new ShapeError()
  return { ok: true }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  /** Map a 404 to `not_found` (the two actions) instead of `unavailable` (a read of a server with no admin side). */
  notFound?: boolean
}

async function request<T>(path: string, parse: (json: unknown) => T, options: RequestOptions = {}): Promise<AdminResult<T> | { kind: 'not_found' }> {
  if (!HISTORY_ENABLED) return { kind: 'unavailable' }
  const token = getAdminToken()
  if (!token) return { kind: 'signed_out' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)
  try {
    if (options.signal?.aborted) return { kind: 'unavailable' }
    const headers: Record<string, string> = { [AUTH_HEADER]: `Bearer ${token}`, Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${HISTORY_API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      signal: controller.signal,
    })

    if (response.status === 401) return { kind: 'signed_out' }
    if (response.status === 403) {
      const body: unknown = await response.json().catch(() => null)
      return { kind: 'refused', recorded: isRecord(body) && body.recorded === true }
    }
    if (response.status === 429) return { kind: 'busy' }
    if (response.status === 404) return options.notFound ? { kind: 'not_found' } : { kind: 'unavailable' }
    if (!response.ok) return { kind: 'unavailable' }

    return { kind: 'ok', data: parse(await response.json()) }
  } catch {
    // A network error, a timeout, unreadable JSON or a wrong shape: the screens treat them all as "not answering".
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

/** Reads never return `not_found`; `request` only does for the actions, which ask for it. */
async function read<T>(path: string, parse: (json: unknown) => T, signal?: AbortSignal): Promise<AdminResult<T>> {
  return (await request(path, parse, { signal })) as AdminResult<T>
}

export const getSession = (signal?: AbortSignal) => read('/api/admin/session', parseSession, signal)
export const getOverview = (signal?: AbortSignal) => read('/api/admin/overview', parseOverview, signal)
export const getUsage = (days: 14 | 30 | 90, signal?: AbortSignal) => read(`/api/admin/usage?days=${days}`, parseUsage, signal)
export const getTt = (days: 14 | 30 | 90, signal?: AbortSignal) => read(`/api/admin/tt?days=${days}`, parseTt, signal)
export const getSecurity = (signal?: AbortSignal) => read('/api/admin/security', parseSecurity, signal)
export const getChannels = (query: string, signal?: AbortSignal) =>
  read(`/api/admin/channels?q=${encodeURIComponent(query)}`, parseChannels, signal)

const act = (path: string, twitchId: string, signal?: AbortSignal): Promise<AdminActionResult> =>
  request(path, parseOk, { method: 'POST', body: { twitch_id: twitchId }, signal, notFound: true }) as Promise<AdminActionResult>

/** Deletes the channel and blocks its login. */
export const removeChannel = (twitchId: string, signal?: AbortSignal) => act('/api/admin/channels/remove', twitchId, signal)
/** Lifts a block. */
export const unblockChannel = (twitchId: string, signal?: AbortSignal) => act('/api/admin/channels/unblock', twitchId, signal)
