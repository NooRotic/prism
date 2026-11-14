import { useSyncExternalStore } from 'react'

export type PlaybackLevel = 'info' | 'ok' | 'warn' | 'error'
export type PlaybackStatus = 'idle' | 'starting' | 'retrying' | 'playing' | 'failed'

export interface PlaybackEntry {
  /** Milliseconds since the session began. */
  at: number
  level: PlaybackLevel
  source: string
  message: string
  data?: Record<string, unknown>
}

export interface PlaybackSnapshot {
  /** Counts the sessions begun on this page (0 while idle), so a reader can tell that a new one started. */
  session: number
  status: PlaybackStatus
  attempts: number
  url: string | null
  kind: string | null
  startedAt: number | null
  entries: readonly PlaybackEntry[]
  /** The state of the player (media element, rendition) taken when it last failed. */
  inspection: Record<string, unknown> | null
  /** Video formats this page has stopped asking for after a decode failure. Outlives a session. */
  avoided: readonly string[]
}

const MAX_ENTRIES = 300
const IDLE: PlaybackSnapshot = { session: 0, status: 'idle', attempts: 0, url: null, kind: null, startedAt: null, entries: [], inspection: null, avoided: [] }

let snapshot: PlaybackSnapshot = IDLE
let sessions = 0
const listeners = new Set<() => void>()

function publish(next: PlaybackSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function entry(at: number, level: PlaybackLevel, source: string, message: string, data?: Record<string, unknown>): PlaybackEntry {
  return data === undefined ? { at, level, source, message } : { at, level, source, message, data }
}

/** Starts a new session for one stream. The last session's lines, status and inspection are gone; the avoided formats stay. */
export function beginPlayback(info: { url: string; kind: string }): void {
  const now = Date.now()
  publish({
    session: ++sessions,
    status: 'starting',
    attempts: 1,
    url: info.url,
    kind: info.kind,
    startedAt: now,
    entries: [entry(0, 'info', 'session', 'Attempt 1: session started')],
    inspection: null,
    avoided: snapshot.avoided,
  })
}

/** Ends the session (the player went away). Does nothing to the avoided formats. */
export function endPlayback(): void {
  publish({ ...IDLE, avoided: snapshot.avoided })
}

/** Adds one line to the session. Ignored while no session runs, so pages with no HLS or DASH player cost nothing. */
export function logPlayback(level: PlaybackLevel, source: string, message: string, data?: Record<string, unknown>): void {
  if (snapshot.status === 'idle' || snapshot.startedAt === null) return
  const next = [...snapshot.entries, entry(Date.now() - snapshot.startedAt, level, source, message, data)]
  publish({ ...snapshot, entries: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next })
}

/** Moves the session along. `retrying` counts a new attempt and writes it in the log. Ignored while no session runs. */
export function setPlaybackStatus(status: PlaybackStatus): void {
  if (snapshot.status === 'idle' || snapshot.startedAt === null || status === 'idle') return
  if (status === 'retrying') {
    const attempts = snapshot.attempts + 1
    publish({
      ...snapshot,
      status,
      attempts,
      entries: [...snapshot.entries, entry(Date.now() - snapshot.startedAt, 'warn', 'session', `Attempt ${attempts}: retrying`)].slice(-MAX_ENTRIES),
    })
    return
  }
  if (snapshot.status === status) return
  publish({ ...snapshot, status })
}

/** Keeps the state of the player as it was when it failed. Ignored while no session runs. */
export function setPlaybackInspection(data: Record<string, unknown>): void {
  if (snapshot.status === 'idle') return
  publish({ ...snapshot, inspection: data })
}

/** Records which video formats the page now avoids. Works with no session, and outlives sessions. */
export function setAvoidedFormats(list: readonly string[]): void {
  if (snapshot.avoided.length === list.length && snapshot.avoided.every((item, index) => item === list[index])) return
  publish({ ...snapshot, avoided: [...list] })
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  return snapshot
}

export function subscribePlayback(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePlaybackLog(): PlaybackSnapshot {
  return useSyncExternalStore(subscribePlayback, getPlaybackSnapshot, getPlaybackSnapshot)
}

/**
 * An address as it may be shown in a report: scheme, host (with port) and path stay; query values become `***` (an
 * address can carry a token), a user name and password become `***@`, the fragment goes. Anything else is not an address.
 */
export function redactAddress(address: string): string {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return '(not an address)'
  }
  if (!url.host) return '(not an address)'
  const auth = url.username || url.password ? '***@' : ''
  const keys = Array.from(url.searchParams.keys())
  const query = keys.length > 0 ? `?${keys.map((key) => `${encodeURIComponent(key)}=***`).join('&')}` : ''
  return `${url.protocol}//${auth}${url.host}${url.pathname}${query}`
}

const ADDRESS_IN_TEXT = /https?:\/\/[^\s"'<>()[\],]+/g

/** Text with every http(s) address in it passed through `redactAddress` (an engine's message can quote the full address). */
export function redactText(text: string): string {
  return text.replace(ADDRESS_IN_TEXT, (match) => {
    const address = match.replace(/[.;:!?]+$/, '')
    return redactAddress(address) + match.slice(address.length)
  })
}

const seconds = (ms: number): string => `+${(ms / 1000).toFixed(1)}s`

function describe(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function lineOf(item: PlaybackEntry): string {
  const data = item.data === undefined ? '' : ` ${describe(item.data)}`
  return redactText(`${seconds(item.at)} ${item.level.padEnd(5)} ${item.source.padEnd(8)} ${item.message}${data}`)
}

function section(title: string, lines: readonly string[]): string[] {
  return ['', `== ${title} ==`, ...(lines.length > 0 ? lines : ['(none)'])]
}

/** The whole session as plain text, to read in the panel and to paste into a bug report. Never contains a query value. */
export function formatPlaybackReport(
  state: PlaybackSnapshot,
  extras: { environment?: Record<string, unknown>; page?: string; now?: Date } = {},
): string {
  const lines: string[] = ['PRISM playback report', `Generated: ${(extras.now ?? new Date()).toISOString()}`]
  if (extras.page) lines.push(`Page: ${redactAddress(extras.page)}`)
  lines.push(
    ...section('Summary', [
      `Status: ${state.status}`,
      `Attempts: ${state.attempts}`,
      `Address: ${state.url === null ? '(none)' : redactAddress(state.url)}`,
      `Type: ${state.kind ?? '(none)'}`,
      `Avoided formats: ${state.avoided.length > 0 ? state.avoided.join(', ') : '(none)'}`,
    ]),
    ...section('Attempts', state.entries.filter((item) => item.source === 'session').map(lineOf)),
    ...section('Timeline', state.entries.map(lineOf)),
    ...section('Last inspection', state.inspection === null ? [] : Object.entries(state.inspection).map(([key, value]) => redactText(`${key}: ${describe(value)}`))),
    ...section('Browser', extras.environment === undefined ? [] : Object.entries(extras.environment).map(([key, value]) => redactText(`${key}: ${describe(value)}`))),
  )
  return lines.join('\n')
}
