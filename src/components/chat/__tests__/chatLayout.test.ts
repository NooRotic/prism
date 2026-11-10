import {
  DEFAULT_RATIO,
  MAX_RATIO,
  MIN_RATIO,
  loadFloatingHeight,
  loadRatio,
  nextFloatingHeight,
  nextRatio,
  sideForPoint,
  storeFloatingHeight,
} from '../chatLayout'
import { STORAGE_KEYS } from '../../../config/storageKeys'

describe('loadRatio', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

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

  it('falls back to the default when reading storage throws', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(loadRatio()).toBe(0.8)
    spy.mockRestore()
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

describe('nextFloatingHeight', () => {
  it('adds the drag distance to the current height', () => {
    expect(nextFloatingHeight(400, 60, 700)).toBe(460)
    expect(nextFloatingHeight(400, -60, 700)).toBe(340)
  })

  it('never goes below zero', () => {
    expect(nextFloatingHeight(30, -100, 700)).toBe(0)
  })

  it('stops at the room available', () => {
    expect(nextFloatingHeight(650, 100, 700)).toBe(700)
  })

  it('rounds to whole pixels, so the stored height matches what the layout reports', () => {
    expect(nextFloatingHeight(400, 10.6, 700)).toBe(411)
  })
})

describe('loadFloatingHeight', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['nothing is stored', null],
    ['the value is not a number', 'abc'],
    ['the value is zero', '0'],
    ['the value is negative', '-5'],
    ['the value is not finite', 'Infinity'],
  ])('is 0 (the default height) when %s', (_label, stored) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, stored)
    expect(loadFloatingHeight()).toBe(0)
  })

  it('is 0 when reading storage throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(loadFloatingHeight()).toBe(0)
  })

  it('returns a stored height', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, '540')
    expect(loadFloatingHeight()).toBe(540)
  })
})

describe('storeFloatingHeight', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('writes the height', () => {
    storeFloatingHeight(540)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBe('540')
  })

  it('removes the entry for 0, so the default height leaves nothing behind', () => {
    storeFloatingHeight(540)
    storeFloatingHeight(0)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBeNull()
  })

  it('does not throw when storage fails', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => storeFloatingHeight(540)).not.toThrow()
  })
})

describe('sideForPoint', () => {
  it('is left strictly before the middle of the viewport and right from the middle on', () => {
    expect(sideForPoint(0, 1000)).toBe('left')
    expect(sideForPoint(499, 1000)).toBe('left')
    expect(sideForPoint(500, 1000)).toBe('right')
    expect(sideForPoint(1000, 1000)).toBe('right')
  })
})
