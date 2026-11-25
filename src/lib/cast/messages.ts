import { logoUrl, type StreamEntry } from '../streamsApi'

/**
 * What PRISM and the TV page say to each other. Anyone on the viewer's network can send such messages, so both sides parse
 * strictly and ignore what they do not know. No message carries a stream's address: that travels only in Cast's own load.
 */

export const CAST_NAMESPACE = 'urn:x-cast:tv.nooroticx.prism'
export const CAST_APP_ID: string = (import.meta.env.VITE_CAST_APP_ID as string | undefined) || '10E81A1E'

const TV_STATES = ['tuning', 'playing', 'buffering', 'paused', 'failed', 'ended', 'idle'] as const
export type TvState = (typeof TV_STATES)[number]

/** TV to PRISM: what is on. */
export interface NowMessage {
  v: 1
  type: 'now'
  id: string | null
  name: string
  state: TvState
}

/** PRISM to TV: the viewer's stars changed. */
export interface ContextMessage {
  v: 1
  type: 'context'
  favorites: string[]
}

/** What a load carries beside the address: which channel it is, and what Up and Down should move through. */
export interface CastLoadData {
  v: 1
  id: string | null
  kind: 'hls' | 'dash'
  live: boolean
  favorites: string[]
  group: string | null
}

/** One stream as both sides play it. */
export interface CastStream {
  id: string | null
  name: string
  url: string
  kind: 'hls' | 'dash'
  live: boolean
  /** An address of PRISM's own copy of the channel picture, or null. */
  logo: string | null
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MAX_FAVORITES = 1000

/** Cast hands over an object or, from some senders, its JSON text. */
function record(raw: unknown): Record<string, unknown> | null {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  return rec.v === 1 ? rec : null
}

const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value)
const isIdOrNull = (value: unknown): value is string | null => value === null || isId(value)

function favoriteIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter(isId))].slice(0, MAX_FAVORITES)
}

export function parseNow(raw: unknown): NowMessage | null {
  const rec = record(raw)
  if (!rec || rec.type !== 'now' || !isIdOrNull(rec.id) || typeof rec.name !== 'string') return null
  const state = TV_STATES.find((known) => known === rec.state)
  return state ? { v: 1, type: 'now', id: rec.id, name: rec.name, state } : null
}

export function parseContext(raw: unknown): ContextMessage | null {
  const rec = record(raw)
  if (!rec || rec.type !== 'context') return null
  const favorites = favoriteIds(rec.favorites)
  return favorites ? { v: 1, type: 'context', favorites } : null
}

export function parseLoadData(raw: unknown): CastLoadData | null {
  const rec = record(raw)
  if (!rec || !isIdOrNull(rec.id) || typeof rec.live !== 'boolean') return null
  if (rec.kind !== 'hls' && rec.kind !== 'dash') return null
  if (rec.group !== null && typeof rec.group !== 'string') return null
  const favorites = favoriteIds(rec.favorites)
  return favorites ? { v: 1, id: rec.id, kind: rec.kind, live: rec.live, favorites, group: rec.group } : null
}

export function contentType(kind: 'hls' | 'dash'): string {
  return kind === 'dash' ? 'application/dash+xml' : 'application/x-mpegurl'
}

/** A listed stream: the list is of live channels. */
export function fromEntry(entry: StreamEntry): CastStream {
  return { id: entry.id, name: entry.name, url: entry.url, kind: entry.kind, live: true, logo: entry.logo === null ? null : logoUrl(entry.logo) }
}
