import type { CastStream } from '../messages'
import { createTuner, type CastEngine, type EngineSample } from '../tuner'

const stream = (id: string): CastStream => ({ id, name: id.toUpperCase(), url: `https://h.test/${id}.m3u8`, kind: 'hls', live: true, logo: null })

function setup() {
  let clock = 0
  let sample: EngineSample | null = null
  const errors = new Set<() => void>()
  const loads: { stream: CastStream; reject: (e: unknown) => void }[] = []
  const engine: CastEngine = {
    load: (s) => new Promise((_, reject) => loads.push({ stream: s, reject })),
    stop: vi.fn(),
    sample: () => sample,
    report: () => ({ engine: 'test', step: null }),
    onError: (l) => {
      errors.add(l)
      return () => errors.delete(l)
    },
    onSenderLoad: () => () => {},
  }
  const tuner = createTuner(engine, () => clock)
  const at = (ms: number, time: number | null, more: Partial<EngineSample> = {}) => {
    clock = ms
    sample = time === null ? null : { time, paused: false, ended: false, stopped: false, ...more }
    tuner.tick(ms)
    return tuner.view().state
  }
  return { tuner, loads, at, error: () => errors.forEach((l) => l()) }
}

it('starts with nothing', () => {
  expect(setup().tuner.view()).toEqual({ stream: null, state: 'idle' })
})

it('tunes, then plays once the picture moves', () => {
  const { tuner, loads, at } = setup()
  tuner.tune(stream('a'))
  expect(loads[0].stream.id).toBe('a')
  expect(tuner.view().state).toBe('tuning')
  expect(at(500, null)).toBe('tuning')
  expect(at(1000, 10)).toBe('tuning')
  expect(at(1250, 10.04)).toBe('tuning')
  expect(at(1500, 10.3)).toBe('playing')
})

it('fails 20 s after tuning with no movement, and recovers if it moves after all', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  expect(at(19_999, 5)).toBe('tuning')
  expect(at(20_000, 5)).toBe('failed')
  expect(at(21_000, 6)).toBe('playing')
})

it('says buffering after 1 s without movement and fails after 20 s', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  expect(at(1000, 2)).toBe('playing')
  expect(at(1999, 2)).toBe('playing')
  expect(at(2000, 2)).toBe('buffering')
  expect(at(20_999, 2)).toBe('buffering')
  expect(at(21_000, 2)).toBe('failed')
})

it('does not count a pause against the stream', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  at(1000, 2)
  expect(at(2000, 2, { paused: true })).toBe('paused')
  expect(at(60_000, 2, { paused: true })).toBe('paused')
  expect(at(60_500, 2)).toBe('playing')
  expect(at(61_500, 2)).toBe('buffering')
  expect(at(79_999, 2)).toBe('buffering')
  expect(at(80_000, 2)).toBe('failed')
})

it('does not take a jump for playing: a window that slides under a stalled stream, or the move to the live edge', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 0)
  expect(at(250, 40)).toBe('tuning') // to the live edge, with no picture yet
  expect(at(500, 40.25)).toBe('playing')
  let time = 40.25
  let state = ''
  for (let t = 750; t <= 25_000; t += 250) {
    if (t % 10_000 === 0) time += 10 // the window slides and the player follows it
    state = at(t, time)
  }
  expect(state).toBe('failed')
})

it('does not take going backwards for playing', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 30)
  expect(at(250, 10)).toBe('tuning')
  expect(at(500, 10.25)).toBe('playing')
})

it('starts counting afresh after a moment with nothing to see', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  at(250, 1.25)
  at(500, null)
  expect(at(10_000, 9)).not.toBe('playing')
})

it('keeps up when the device is busy and looks less often', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  at(250, 1.25)
  expect(at(4250, 5.25)).toBe('playing')
})

it('a pause before the first picture moved counts as started, not as tuning', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1, { paused: true })
  expect(at(500, 1)).toBe('playing')
  expect(at(1500, 1)).toBe('buffering')
})

it('says when a recording has ended, and when playing was stopped', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  at(1000, 2)
  expect(at(2000, 2, { ended: true })).toBe('ended')
  expect(at(90_000, 2, { ended: true })).toBe('ended')
  tuner.tune(stream('b'))
  expect(at(91_000, 0, { stopped: true })).toBe('idle')
  expect(tuner.view().stream).toBeNull()
})

it('a stop while it is loading is a stop, whatever becomes of the load', async () => {
  const { tuner, loads, at } = setup()
  tuner.tune(stream('a'))
  expect(at(500, 0, { stopped: true })).toBe('idle')
  loads[0].reject('load_cancelled')
  await Promise.resolve()
  await Promise.resolve()
  expect(tuner.view()).toEqual({ stream: null, state: 'idle' })
})

it('fails at once on an error or a refused load', async () => {
  const one = setup()
  one.tuner.tune(stream('a'))
  one.error()
  expect(one.tuner.view().state).toBe('failed')

  const two = setup()
  two.tuner.tune(stream('a'))
  two.loads[0].reject(new Error('no'))
  await Promise.resolve()
  await Promise.resolve()
  expect(two.tuner.view().state).toBe('failed')
})

it('ignores the old channel’s late failure', async () => {
  const { tuner, loads } = setup()
  tuner.tune(stream('a'))
  tuner.tune(stream('b'))
  loads[0].reject(new Error('late'))
  await Promise.resolve()
  await Promise.resolve()
  expect(tuner.view()).toEqual({ stream: stream('b'), state: 'tuning' })
})

it('starts each tune afresh: the last one’s movement does not count', () => {
  const { tuner, at } = setup()
  tuner.tune(stream('a'))
  at(0, 1)
  expect(at(1000, 2)).toBe('playing')
  tuner.tune(stream('b'))
  expect(at(1250, 500)).toBe('tuning')
})

it('takes over a load the sender made without loading it again', () => {
  const { tuner, loads, at } = setup()
  tuner.adopt(stream('a'))
  expect(loads).toHaveLength(0)
  expect(tuner.view().state).toBe('tuning')
  at(0, 1)
  expect(at(1000, 2)).toBe('playing')
})

it('tells listeners once per change', () => {
  const { tuner, at } = setup()
  const seen: string[] = []
  const off = tuner.subscribe(() => seen.push(tuner.view().state))
  tuner.tune(stream('a'))
  at(0, 1)
  at(1000, 2)
  at(1250, 3)
  off()
  at(5000, 3)
  expect(seen).toEqual(['tuning', 'playing'])
})
