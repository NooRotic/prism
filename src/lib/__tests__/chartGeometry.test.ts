import { barHeights, linePoints } from '../chartGeometry'

describe('barHeights', () => {
  it('scales values to the tallest, gives zero a 2px stub and leaves null as null', () => {
    expect(barHeights([0, 5, 10, null], 100)).toEqual([2, 50, 100, null])
  })

  it('draws a single value at full height', () => {
    expect(barHeights([7], 76)).toEqual([76])
  })

  it('gives every bar the stub height when all values are zero', () => {
    expect(barHeights([0, 0, 0], 76)).toEqual([2, 2, 2])
  })

  it('gives nothing for no values and keeps an all-null list null', () => {
    expect(barHeights([], 76)).toEqual([])
    expect(barHeights([null, null], 76)).toEqual([null, null])
  })

  it('never draws a value above zero thinner than the zero stub', () => {
    expect(barHeights([1, 1000], 76)).toEqual([2, 76])
  })

  it('treats a value that is not a finite number as unknown, and a negative one as zero', () => {
    expect(barHeights([Number.NaN, Number.POSITIVE_INFINITY, -3, 4], 80)).toEqual([null, null, 2, 80])
  })

  it('never produces NaN', () => {
    const inputs: (number | null)[][] = [[], [0], [0, 0], [null], [5], [Number.NaN, 0], [1e-9, 0]]
    for (const input of inputs) {
      for (const height of barHeights(input, 76)) {
        expect(height === null || Number.isFinite(height)).toBe(true)
      }
    }
  })
})

describe('linePoints', () => {
  it('maps time to x across the width and value to y with the top at the largest value', () => {
    const points = [
      { at: 0, value: 10 },
      { at: 100, value: 20 },
    ]

    expect(linePoints(points, 0, 100, 200, 50)).toBe('0,25 200,0')
  })

  it('puts a zero value on the baseline', () => {
    expect(linePoints([{ at: 0, value: 0 }, { at: 100, value: 4 }], 0, 100, 200, 50)).toBe('0,50 200,0')
  })

  it('draws a flat line on the baseline when every value is zero', () => {
    expect(linePoints([{ at: 0, value: 0 }, { at: 100, value: 0 }], 0, 100, 200, 50)).toBe('0,50 200,50')
  })

  it('places a single point by its time', () => {
    expect(linePoints([{ at: 50, value: 5 }], 0, 100, 200, 50)).toBe('100,0')
  })

  it('centres the points when the span has no length', () => {
    expect(linePoints([{ at: 5, value: 1 }], 5, 5, 200, 50)).toBe('100,0')
  })

  it('keeps a point outside the span on its edge', () => {
    expect(linePoints([{ at: -10, value: 1 }, { at: 500, value: 1 }], 0, 100, 200, 50)).toBe('0,0 200,0')
  })

  it('rounds to one decimal', () => {
    expect(linePoints([{ at: 1, value: 1 }], 0, 3, 10, 10)).toBe('3.3,0')
  })

  it('gives an empty string for no points', () => {
    expect(linePoints([], 0, 100, 200, 50)).toBe('')
  })

  it('never produces NaN', () => {
    const cases: [{ at: number; value: number }[], number, number][] = [
      [[], 0, 0],
      [[{ at: 1, value: 0 }], 1, 1],
      [[{ at: 1, value: 3 }], 1, 1],
      [[{ at: 1, value: 0 }, { at: 2, value: 0 }], 0, 2],
    ]
    for (const [points, from, to] of cases) {
      expect(linePoints(points, from, to, 100, 40)).not.toContain('NaN')
    }
  })
})
