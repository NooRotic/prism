import type { StreamEntry } from '../streamsApi'
import { step, type GuideGroup } from './surf'

/**
 * The TV remote's rules, with no TV in them. Measured on a Google TV Streamer: a held key repeats as plain `keydown`s (the
 * first after 400 ms, then about every 50) and the `repeat` flag is never set, so a press is told from a hold by time alone.
 * `keyup` takes no part in that: a device may send one with every repeat. It is only claimed, so that the device does not
 * act on the release of a key whose press was PRISM's.
 *
 * Times are the events' own (`event.timeStamp`), so a busy moment of the device does not stretch the gaps between keys.
 */

/** The same key this soon after its previous keydown is still held: longer than the 400 ms to the first repeat. */
const FIRST_REPEAT_MS = 600
/** The same once it is repeating: longer than the slowest gap seen between repeats (180 ms). */
const NEXT_REPEAT_MS = 300
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
  /** What is tuned is not working (it failed or ended): choosing it again is a way to try again. */
  retry: boolean
}

/** Where the guide stands: what it is, and where that was last seen (the list can change under an open guide). */
export interface GuidePosition {
  key: string
  id: string
  group: number
  row: number
}

export interface RemoteState {
  guide: GuidePosition | null
  /** A flip with the guide closed that waits to be tuned. */
  pending: { entry: StreamEntry; at: number } | null
  lastKey: { key: string; at: number; repeating: boolean } | null
  lastStepAt: number
  backArmedAt: number | null
  lastInputAt: number
  /** Keys whose press was claimed and whose release has not been seen. */
  down: readonly string[]
}

export const REMOTE_START: RemoteState = { guide: null, pending: null, lastKey: null, lastStepAt: -Infinity, backArmedAt: null, lastInputAt: 0, down: [] }

export type RemoteEvent =
  | { type: 'keydown' | 'keyup'; key: string }
  | { type: 'tick' }
  /** The computer tuned the TV: a flip that was waiting is out of date. */
  | { type: 'taken' }

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

const isBackKey = (key: string): boolean => key === 'BrowserBack' || key === 'GoBack' || key === 'Escape' || key === 'Backspace'

const place = (groups: GuideGroup[], group: number, row: number): GuidePosition => ({ key: groups[group].key, id: groups[group].streams[row].id, group, row })

/** Where a guide position is in these groups now: what it stood on if that is still there, otherwise the nearest place. */
export function resolveGuide(guide: GuidePosition, groups: GuideGroup[]): GuidePosition | null {
  if (groups.length === 0) return null
  const byKey = groups.findIndex((g) => g.key === guide.key)
  const group = byKey === -1 ? Math.min(guide.group, groups.length - 1) : byKey
  const { streams } = groups[group]
  const byId = streams.findIndex((stream) => stream.id === guide.id)
  return place(groups, group, byId === -1 ? Math.min(guide.row, streams.length - 1) : byId)
}

const rowOf = (group: GuideGroup, id: string | null): number => Math.max(0, group.streams.findIndex((stream) => stream.id === id))

/** The first group that holds the playing channel, standing on it; otherwise the first group's first row. */
function openGuide(ctx: RemoteContext): GuidePosition {
  const group = Math.max(0, ctx.groups.findIndex((g) => g.streams.some((stream) => stream.id === ctx.playingId)))
  return place(ctx.groups, group, rowOf(ctx.groups[group], ctx.playingId))
}

export function remote(previous: RemoteState, event: RemoteEvent, now: number, ctx: RemoteContext): RemoteResult {
  const state: RemoteState = { ...previous, guide: previous.guide && resolveGuide(previous.guide, ctx.groups) }
  const effects: RemoteEffect[] = []
  const done = (claimed: boolean): RemoteResult => ({ state, effects, claimed })

  if (event.type === 'taken') {
    state.pending = null
    return done(false)
  }

  if (event.type === 'tick') {
    if (state.guide && now - state.lastInputAt >= GUIDE_CLOSES_MS) state.guide = null
    if (state.pending && now - state.pending.at >= TUNE_AFTER_MS) {
      const { entry } = state.pending
      state.pending = null
      if (entry.id !== ctx.playingId || ctx.retry) effects.push({ type: 'tune', entry })
    }
    return done(false)
  }

  if (event.type === 'keyup') {
    const claimed = state.down.includes(event.key)
    if (claimed) state.down = state.down.filter((key) => key !== event.key)
    return done(claimed)
  }

  const back = isBackKey(event.key)
  const ok = event.key === 'Enter'
  const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  const sideways = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (!back && !ok && vertical === 0 && sideways === 0) return { state: previous, effects: [], claimed: false }

  if (!state.down.includes(event.key)) state.down = [...state.down, event.key]
  const key = back ? 'Back' : event.key // one button can have two names
  const gap = state.lastKey ? now - state.lastKey.at : Infinity
  const held = state.lastKey?.key === key && gap >= 0 && gap < (state.lastKey.repeating ? NEXT_REPEAT_MS : FIRST_REPEAT_MS)
  state.lastKey = { key, at: now, repeating: held }
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
      if (chosen.id !== ctx.playingId || ctx.retry) effects.push({ type: 'tune', entry: chosen })
    } else {
      state.pending = null
      effects.push({ type: 'refreshList' })
      if (ctx.groups.length === 0) effects.push({ type: 'noList' })
      else state.guide = openGuide(ctx)
    }
    return done(true)
  }

  // Nothing with the guide closed, but not Cast's either: it would move about in the stream with nothing on screen to say so.
  if (sideways !== 0 && !state.guide) return done(true)

  const sinceStep = now - state.lastStepAt
  if (sinceStep >= 0 && sinceStep < STEP_MS) return done(true)
  state.lastStepAt = now

  if (state.guide) {
    const { groups } = ctx
    if (sideways !== 0) {
      const group = (state.guide.group + sideways + groups.length) % groups.length
      state.guide = place(groups, group, rowOf(groups[group], ctx.playingId))
    } else {
      const count = groups[state.guide.group].streams.length
      state.guide = place(groups, state.guide.group, (state.guide.row + vertical + count) % count)
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
