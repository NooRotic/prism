import { DEFAULT_RATIO, MAX_RATIO, MIN_RATIO, loadRatio, nextRatio } from '../chatLayout'
import { STORAGE_KEYS } from '../../../config/storageKeys'

describe('loadRatio', () => {
  beforeEach(() => localStorage.clear())

  it('exposes the existing split bounds', () => {
    expect([DEFAULT_RATIO, MIN_RATIO, MAX_RATIO]).toEqual([0.8, 0.5, 0.92])
  })

  it.each([
    ['nothing is stored', null],
    ['the value is not a number', 'abc'],
    ['the value is below the minimum', '0.2'],
    ['the value is above the maximum', '0.99'],
  ])('falls back to the default when %s', (_label, stored) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEYS.LOCAL_PANEL_RATIO, stored)
    expect(loadRatio()).toBe(0.8)
  })

  it('returns a valid stored ratio', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_PANEL_RATIO, '0.7')
    expect(loadRatio()).toBe(0.7)
  })
})

describe('nextRatio', () => {
  it('grows the player when dragging right with the chat on the right', () => {
    expect(nextRatio(0.8, 100, 1000, 'right')).toBeCloseTo(0.9, 5)
  })

  it('shrinks the player when dragging right with the chat on the left', () => {
    expect(nextRatio(0.8, 100, 1000, 'left')).toBeCloseTo(0.7, 5)
  })

  it('clamps to the bounds on both sides', () => {
    expect(nextRatio(0.9, 500, 1000, 'right')).toBe(0.92)
    expect(nextRatio(0.6, -500, 1000, 'right')).toBe(0.5)
    expect(nextRatio(0.6, 500, 1000, 'left')).toBe(0.5)
    expect(nextRatio(0.9, -500, 1000, 'left')).toBe(0.92)
  })

  it('returns the previous ratio when the container has no width', () => {
    expect(nextRatio(0.8, 100, 0, 'right')).toBe(0.8)
  })
})
