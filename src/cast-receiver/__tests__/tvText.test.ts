import { clockParts, debugLine, type DebugInput } from '../tvText'

const base: DebugInput = { state: 'tuning', sinceTuneMs: 1420, startedInMs: null, report: { engine: 'shaka', step: 'PLAYER_LOADING' }, kind: 'hls', live: true, place: { at: 12, of: 58 } }
const PLAYING = { engine: 'shaka', step: 'PLAYING', width: 1920, height: 1080, bitrate: 6.2e6, bandwidth: 4.1e7, buffered: 8.4, behindLive: 4.1, dropped: 0 }

describe('the debug line', () => {
  it('while tuning: time since the tune, the player’s step, the engine, the kind and the place in the list', () => {
    expect(debugLine(base)).toBe('00:01.42 · PLAYER_LOADING · shaka · hls · ch 12/58')
  })

  it('while playing: the picture, the bitrate, the buffer, the live delay, dropped frames and how long the start took', () => {
    expect(debugLine({ ...base, state: 'playing', report: PLAYING, startedInMs: 2310 })).toBe(
      'PLAYING · 1920×1080 · 6.2 of 41 Mb/s · buf 8.4 s · behind live 4.1 s · dropped 0 · start 2.31 s',
    )
  })

  it('paused says so', () => {
    expect(debugLine({ ...base, state: 'paused', report: { engine: 'shaka', step: 'PAUSE', width: 1280, height: 720 }, startedInMs: 900 })).toBe('PAUSED · 1280×720 · start 0.90 s')
  })

  it('a dead channel leads with the player’s error', () => {
    expect(debugLine({ ...base, state: 'failed', sinceTuneMs: 20_000, report: { engine: 'shaka', step: 'ERROR 905' } })).toBe('ERROR 905 · 00:20.00 · shaka · hls')
  })

  it('leaves out what it does not have', () => {
    const line = debugLine({ ...base, sinceTuneMs: 500, report: { engine: 'shaka', step: null }, place: null })
    expect(line).toBe('00:00.50 · shaka · hls')
    expect(debugLine({ ...base, state: 'playing', report: { engine: 'shaka', step: 'PLAYING', bitrate: 6.2e6 }, startedInMs: null })).toBe('PLAYING · 6.2 Mb/s')
  })

  it('never says NaN, undefined, Infinity or null', () => {
    const odd = { engine: 'shaka', step: null, width: Number.NaN, height: 5, bitrate: Number.POSITIVE_INFINITY, buffered: Number.NaN, dropped: -1 }
    for (const state of ['tuning', 'playing', 'failed', 'buffering'] as const) {
      expect(debugLine({ ...base, state, report: odd, startedInMs: Number.NaN, sinceTuneMs: Number.NaN })).not.toMatch(/NaN|undefined|Infinity|null/)
    }
  })

  it('a slow connection keeps its decimal, and a bandwidth of 0 is not yet known', () => {
    const at = (report: object) => debugLine({ ...base, state: 'playing', report: { engine: 'shaka', step: 'PLAYING', bitrate: 8e5, ...report }, startedInMs: null })
    expect(at({ bandwidth: 4e5 })).toBe('PLAYING · 0.8 of 0.4 Mb/s')
    expect(at({ bandwidth: 0 })).toBe('PLAYING · 0.8 Mb/s')
    expect(at({ bitrate: 0, bandwidth: 0 })).toBe('PLAYING')
    expect(at({ bitrate: 6.2e6, bandwidth: 4.1e7 })).toBe('PLAYING · 6.2 of 41 Mb/s')
  })

  it('a recording is never "behind live"', () => {
    expect(debugLine({ ...base, state: 'playing', live: false, report: PLAYING, startedInMs: 2310 })).not.toContain('behind live')
  })

  it('says nothing with nothing on', () => {
    expect(debugLine({ ...base, state: 'idle' })).toBe('')
  })
})

describe('the clock', () => {
  const at = new Date('2026-11-26T02:47:00Z')

  it('keeps the device’s own 12-hour habit and time zone', () => {
    expect(clockParts(at, 'en-US', 'America/New_York')).toEqual({ time: '9:47', period: 'PM' })
  })

  it('and its 24-hour one', () => {
    expect(clockParts(at, 'en-GB', 'Europe/London')).toEqual({ time: '02:47', period: null })
  })

  it('midnight on a 24-hour clock is 00:00', () => {
    expect(clockParts(new Date('2026-11-26T00:00:00Z'), 'en-GB', 'Europe/London')).toEqual({ time: '00:00', period: null })
  })

  it('midnight is 12, in the morning', () => {
    expect(clockParts(new Date('2026-11-26T05:00:00Z'), 'en-US', 'America/New_York')).toEqual({ time: '12:00', period: 'AM' })
  })

  it('works with no locale or zone given', () => {
    expect(clockParts(at).time).toMatch(/^\d{1,2}\D\d{2}$/)
  })
})
