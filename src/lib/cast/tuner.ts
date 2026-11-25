import type { CastLoadData, CastStream, TvState } from './messages'

export interface EngineSample {
  time: number
  paused: boolean
  /** A recording reached its end. */
  ended: boolean
  /** Someone stopped it (a voice command, another app's remote), as opposed to it failing. */
  stopped: boolean
}

/** The one thing that plays. It can be replaced without the rest of the TV page noticing. */
export interface CastEngine {
  /** Rejects when the load is refused. */
  load(stream: CastStream): Promise<void>
  stop(): void
  /** The current stream's, or null while it has none: never the previous stream's. */
  sample(): EngineSample | null
  onError(listener: () => void): () => void
  onSenderLoad(listener: (stream: CastStream, data: CastLoadData | null) => void): () => void
}

export interface TunerView {
  stream: CastStream | null
  state: TvState
}

export interface Tuner {
  tune(stream: CastStream): void
  /** A load the sender made: already on its way, only watched. */
  adopt(stream: CastStream): void
  tick(now: number): void
  view(): TunerView
  subscribe(listener: () => void): () => void
}

const FAIL_AFTER_MS = 20_000
const BUFFERING_AFTER_MS = 1_000
const MOVED_S = 0.05
/** A step forward this much longer than the time that passed is a jump (to the live edge, or after a sliding window), not play. */
const JUMP_S = 1

/** Watches whether what was tuned really plays. What counts is the picture's clock moving, not what the player reports. */
export function createTuner(engine: CastEngine, now: () => number): Tuner {
  let current: TunerView = { stream: null, state: 'idle' }
  // Each tune has a number; an answer from an older one is ignored.
  let tune = 0
  let lastTime: number | null = null
  let lastSampleAt = 0
  let lastMoveAt = 0
  let started = false
  const listeners = new Set<() => void>()

  function set(next: TunerView): void {
    if (next.stream === current.stream && next.state === current.state) return
    current = next
    for (const listener of [...listeners]) listener()
  }
  const setState = (state: TvState) => set({ stream: current.stream, state })

  function begin(stream: CastStream): number {
    tune += 1
    lastTime = null
    lastMoveAt = now()
    started = false
    set({ stream, state: 'tuning' })
    return tune
  }

  /** Whether the picture's clock went on as it does when playing. Keeps what it saw for the next look. */
  function playedOn(sample: EngineSample | null, at: number): boolean {
    if (sample === null) {
      lastTime = null
      return false
    }
    const forward = lastTime === null ? 0 : sample.time - lastTime
    const most = ((at - lastSampleAt) / 1000) * 2 + JUMP_S
    if (lastTime === null || Math.abs(forward) > MOVED_S) lastTime = sample.time
    lastSampleAt = at
    return forward > MOVED_S && forward <= most
  }

  engine.onError(() => {
    if (current.stream) setState('failed')
  })

  return {
    tune(stream) {
      const mine = begin(stream)
      engine.load(stream).catch(() => {
        if (mine === tune) setState('failed')
      })
    },
    adopt(stream) {
      begin(stream)
    },
    tick(at) {
      if (!current.stream) return
      const sample = engine.sample()
      if (sample?.stopped) return set({ stream: null, state: 'idle' })
      if (sample?.ended) return setState('ended')
      if (sample?.paused) {
        lastTime = sample.time
        lastSampleAt = at
        lastMoveAt = at
        started = true
        return setState('paused')
      }
      const moved = playedOn(sample, at)
      if (moved) {
        lastMoveAt = at
        started = true
        return setState('playing')
      }
      if (current.state === 'failed') return
      const still = at - lastMoveAt
      if (still >= FAIL_AFTER_MS) setState('failed')
      else if (!started) setState('tuning')
      else setState(still >= BUFFERING_AFTER_MS ? 'buffering' : 'playing')
    },
    view: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
