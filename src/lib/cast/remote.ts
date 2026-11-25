import type { StreamEntry } from '../streamsApi'
import { step, type GuideGroup } from './surf'

/**
 * The TV remote's rules, with no TV in them. Measured on a Google TV Streamer: a held key repeats as plain `keydown`s (the
 * first after 400 ms, then every 50 ms) and the `repeat` flag is never set, so a press is told from a hold by time alone.
 */

/** The same key within this of its previous keydown is the same press, still held. Longer than the first repeat's 400 ms. */
const PRESS_GAP_MS = 600
/** Moving: one step per this, however fast the key repeats. */
const STEP_MS = 100
/** A flip with the guide closed is tuned this long after the last step: a start takes seconds, so none is wasted on the way. */
const TUNE_AFTER_MS = 600
const GUIDE_CLOSES_MS = 15_000
export const BACK_AGAIN_MS = 3_000

export interface RemoteContext {
  surf: StreamEntry[]
  groups: GuideGroup[]
  playingId: string | null
}

export interface GuidePosition {
  group: number
  row: number
}

export interface RemoteState {
  guide: GuidePosition | null
  /** A flip with the guide closed that waits to be tuned. */
  pending: { entry: StreamEntry; at: number } | null
  lastKey: { key: string; at: number } | null
  lastStepAt: number
  backArmedAt: number | null
  lastInputAt: number
}

export const REMOTE_START: RemoteState = { guide: null, pending: null, lastKey: null, lastStepAt: -Infinity, backArmedAt: null, lastInputAt: 0 }

export type RemoteEvent = { type: 'keydown' | 'keyup'; key: string } | { type: 'tick' }

export type RemoteEffect =
  | { type: 'tune'; entry: StreamEntry }
  | { type: 'preview'; entry: StreamEntry }
  | { type: 'backHint' }
  | { type: 'leave' }
  | { type: 'noList' }
  | { type: 'refreshList' }

export interface RemoteResult {
  state: RemoteState
  effects: RemoteEffect[]
  /** The page takes this key; any other is left to Cast and the device. */
  claimed: boolean
}

export function isBackKey(key: string): boolean {
  return key === 'BrowserBack' || key === 'GoBack' || key === 'Escape' || key === 'Backspace'
}

/** A place that exists in these groups, or null when there are none. */
export function clampGuide(guide: GuidePosition, groups: GuideGroup[]): GuidePosition | null {
  if (groups.length === 0) return null
  const group = Math.min(guide.group, groups.length - 1)
  return { group, row: Math.min(guide.row, groups[group].streams.length - 1) }
}

const rowOf = (group: GuideGroup, id: string | null): number => Math.max(0, group.streams.findIndex((stream) => stream.id === id))

/** The first group that holds the playing channel, standing on it; otherwise the first group's first row. */
function openGuide(ctx: RemoteContext): GuidePosition {
  const group = Math.max(0, ctx.groups.findIndex((g) => g.streams.some((stream) => stream.id === ctx.playingId)))
  return { group, row: rowOf(ctx.groups[group], ctx.playingId) }
}

export function remote(previous: RemoteState, event: RemoteEvent, now: number, ctx: RemoteContext): RemoteResult {
  const guide = previous.guide && clampGuide(previous.guide, ctx.groups)
  const state: RemoteState = { ...previous, guide }
  const effects: RemoteEffect[] = []
  const done = (claimed: boolean): RemoteResult => ({ state, effects, claimed })

  if (event.type === 'tick') {
    if (state.guide && now - state.lastInputAt >= GUIDE_CLOSES_MS) state.guide = null
    if (state.pending && now - state.pending.at >= TUNE_AFTER_MS) {
      const { entry } = state.pending
      state.pending = null
      // Back on what plays: nothing to do, unless it is the only channel there is (a way to try it again).
      if (entry.id !== ctx.playingId || ctx.surf.length === 1) effects.push({ type: 'tune', entry })
    }
    return done(false)
  }

  const { key } = event
  if (event.type === 'keyup') {
    if (state.lastKey?.key === key) state.lastKey = null
    return done(false)
  }

  const back = isBackKey(key)
  const ok = key === 'Enter'
  const vertical = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
  const sideways = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
  if (!back && !ok && vertical === 0 && (sideways === 0 || !state.guide)) return { state: previous, effects: [], claimed: false }

  const held = state.lastKey?.key === key && now - state.lastKey.at < PRESS_GAP_MS
  state.lastKey = { key, at: now }
  state.lastInputAt = now
  if (!back) state.backArmedAt = null

  if (back) {
    if (held) return done(true)
    if (state.guide) {
      state.guide = null
    } else if (state.backArmedAt !== null && now - state.backArmedAt <= BACK_AGAIN_MS) {
      state.backArmedAt = null
      effects.push({ type: 'leave' })
    } else {
      state.backArmedAt = now
      effects.push({ type: 'backHint' })
    }
    return done(true)
  }

  if (ok) {
    if (held) return done(true)
    if (state.guide) {
      const chosen = ctx.groups[state.guide.group].streams[state.guide.row]
      state.guide = null
      if (chosen.id !== ctx.playingId) effects.push({ type: 'tune', entry: chosen })
    } else {
      state.pending = null
      effects.push({ type: 'refreshList' })
      if (ctx.groups.length === 0) effects.push({ type: 'noList' })
      else state.guide = openGuide(ctx)
    }
    return done(true)
  }

  if (now - state.lastStepAt < STEP_MS) return done(true)
  state.lastStepAt = now

  if (state.guide) {
    const { groups } = ctx
    if (sideways !== 0) {
      const group = (state.guide.group + sideways + groups.length) % groups.length
      state.guide = { group, row: rowOf(groups[group], ctx.playingId) }
    } else {
      const count = groups[state.guide.group].streams.length
      state.guide = { ...state.guide, row: (state.guide.row + vertical + count) % count }
    }
    return done(true)
  }

  const next = step(ctx.surf, state.pending?.entry.id ?? ctx.playingId, vertical)
  if (next === null) {
    effects.push({ type: 'noList' })
  } else {
    state.pending = { entry: next, at: now }
    effects.push({ type: 'preview', entry: next })
  }
  return done(true)
}
