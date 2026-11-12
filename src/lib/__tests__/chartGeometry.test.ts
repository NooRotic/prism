import { barHeights, linePoints, sharedRange, trendSegments } from '../chartGeometry'

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

describe('sharedRange', () => {
  it('spans the smallest and largest value of every series', () => {
    expect(sharedRange([[{ value: 10 }, { value: 20 }], [{ value: 30 }, { value: 40 }]])).toEqual({ min: 10, max: 40 })
  })

  it('ignores nulls and values that are not finite numbers', () => {
    expect(sharedRange([[{ value: null }, { value: 5 }, { value: NaN }, { value: Infinity }, { value: 9 }]])).toEqual({ min: 5, max: 9 })
  })

  it('is null when there is no usable value', () => {
    expect(sharedRange([])).toBeNull()
    expect(sharedRange([[], [{ value: null }]])).toBeNull()
  })
})

describe('trendSegments', () => {
  const W = 300
  const H = 76

  it('breaks the line at a null', () => {
    const segments = trendSegments(
      [{ at: 0, value: 1 }, { at: 1, value: 2 }, { at: 2, value: null }, { at: 3, value: 4 }],
      0,
      3,
      W,
      H,
    )

    expect(segments.map((s) => s.length)).toEqual([2, 1])
  })

  it('is not zero based: values 1000 and 1010 span the full height', () => {
    const [segment] = trendSegments([{ at: 0, value: 1000 }, { at: 1, value: 1010 }], 0, 1, W, H)

    expect(segment.map((p) => p.y)).toEqual([H, 0])
    expect(segment.map((p) => p.x)).toEqual([0, W])
  })

  it('puts a flat series at mid height', () => {
    const [segment] = trendSegments([{ at: 0, value: 5 }, { at: 1, value: 5 }], 0, 1, W, H)

    expect(segment.map((p) => p.y)).toEqual([H / 2, H / 2])
  })

  it('with invert puts the smaller value higher, for a rank where lower is better', () => {
    const [segment] = trendSegments([{ at: 0, value: 1000 }, { at: 1, value: 1010 }], 0, 1, W, H, { invert: true })

    expect(segment.map((p) => p.y)).toEqual([0, H])
  })

  it('lets two series share one scale, so a peak line sits above an average line', () => {
    const avg = [{ at: 0, value: 10 }, { at: 1, value: 20 }]
    const peak = [{ at: 0, value: 30 }, { at: 1, value: 40 }]
    const range = sharedRange([avg, peak]) ?? undefined

    const [avgLine] = trendSegments(avg, 0, 1, W, H, { range })
    const [peakLine] = trendSegments(peak, 0, 1, W, H, { range })

    expect(avgLine[0].y).toBe(H)
    expect(peakLine[1].y).toBe(0)
    expect(peakLine[0].y).toBeLessThan(avgLine[1].y)
  })

  it('keeps a point outside the span on its edge', () => {
    const [segment] = trendSegments([{ at: -5, value: 1 }, { at: 99, value: 2 }], 0, 10, W, H)

    expect(segment.map((p) => p.x)).toEqual([0, W])
  })

  it('gives one segment of one coordinate for a lone point, centred when the span has no length', () => {
    expect(trendSegments([{ at: 5, value: 3 }], 5, 5, W, H)).toEqual([[{ x: W / 2, y: H / 2 }]])
  })

  it('gives nothing for no points or when every value is unknown', () => {
    expect(trendSegments([], 0, 1, W, H)).toEqual([])
    expect(trendSegments([{ at: 0, value: null }, { at: 1, value: null }], 0, 1, W, H)).toEqual([])
  })

  it('never produces NaN', () => {
    const cases: { at: number; value: number | null }[][] = [
      [{ at: 0, value: NaN }, { at: 1, value: 2 }],
      [{ at: 0, value: Infinity }, { at: 1, value: 2 }],
      [{ at: 0, value: 0 }, { at: 0, value: 0 }],
    ]
    for (const points of cases) {
      expect(JSON.stringify(trendSegments(points, 0, 0, W, H))).not.toContain('null')
    }
  })
})
