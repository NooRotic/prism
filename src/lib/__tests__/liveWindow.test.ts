import { describe, expect, it } from 'vitest'
import { formatBehindLive, liveScrubState, timeBehindLive } from '../liveWindow'

describe('liveScrubState', () => {
  it('reports how far behind live the playhead is', () => {
    expect(liveScrubState({ start: 1000, end: 2800 }, 2500)).toEqual({ windowSeconds: 1800, behindLive: 300 })
  })

  it('is at the live edge when the playhead is at the end', () => {
    expect(liveScrubState({ start: 0, end: 600 }, 600)?.behindLive).toBe(0)
  })

  it('clamps a playhead outside the window', () => {
    expect(liveScrubState({ start: 100, end: 400 }, 50)?.behindLive).toBe(300)
    expect(liveScrubState({ start: 100, end: 400 }, 450)?.behindLive).toBe(0)
  })

  it('returns null when the window is too short to be worth scrubbing', () => {
    expect(liveScrubState({ start: 0, end: 20 }, 10)).toBeNull()
  })

  it('returns null for a missing or non-finite window', () => {
    expect(liveScrubState(null, 0)).toBeNull()
    expect(liveScrubState(undefined, 0)).toBeNull()
    expect(liveScrubState({ start: 0, end: Infinity }, 5)).toBeNull()
    expect(liveScrubState({ start: 0, end: 600 }, NaN)).toBeNull()
  })
})

describe('timeBehindLive', () => {
  it('is the window end minus the seconds behind', () => {
    expect(timeBehindLive({ start: 1000, end: 2800 }, 300)).toBe(2500)
  })

  it('never leaves the window', () => {
    expect(timeBehindLive({ start: 1000, end: 2800 }, 99999)).toBe(1000)
    expect(timeBehindLive({ start: 1000, end: 2800 }, -5)).toBe(2800)
  })
})

describe('formatBehindLive', () => {
  it('says LIVE at the edge', () => {
    expect(formatBehindLive(0)).toBe('LIVE')
    expect(formatBehindLive(1.5)).toBe('LIVE')
  })

  it('shows minutes and seconds behind', () => {
    expect(formatBehindLive(65)).toBe('-1:05')
    expect(formatBehindLive(750)).toBe('-12:30')
  })
})
