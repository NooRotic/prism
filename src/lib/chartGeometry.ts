/** A value above zero is never drawn thinner than the stub that stands for zero. */
const STUB_PX = 2

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Bar heights in px for a row of values, scaled so the largest reaches `maxPx`. A null (or a
 * value that is not a finite number) stays null, meaning "no bar"; zero becomes a thin stub, so
 * a day with nothing is still visible and different from a day that is unknown; a negative
 * value counts as zero.
 */
export function barHeights(values: (number | null)[], maxPx: number): (number | null)[] {
  const known = values.map((v) => (v !== null && Number.isFinite(v) ? Math.max(0, v) : null))
  const largest = Math.max(0, ...known.filter((v): v is number => v !== null))

  return known.map((v) => {
    if (v === null) return null
    if (v === 0 || largest === 0) return STUB_PX
    return Math.max(STUB_PX, Math.round((v / largest) * maxPx))
  })
}

/**
 * Where each point sits in a `width` x `height` drawing: x by time across `from` to `to` (a point
 * outside the span stays on its edge; a span with no length centres the points), y by value with
 * the largest at the top and zero on the baseline. Coordinates are rounded to one decimal.
 */
export function lineCoordinates(
  points: { at: number; value: number }[],
  from: number,
  to: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const largest = Math.max(0, ...points.map((p) => p.value).filter((v) => Number.isFinite(v)))
  const span = to - from

  return points.map(({ at, value }) => {
    const across = span > 0 ? Math.min(1, Math.max(0, (at - from) / span)) : 0.5
    const level = largest > 0 && Number.isFinite(value) ? Math.max(0, value) / largest : 0
    return { x: round1(across * width), y: round1(height - level * height) }
  })
}

/** The same positions as an SVG `points` string ("x,y x,y ..."); empty for no points. */
export function linePoints(
  points: { at: number; value: number }[],
  from: number,
  to: number,
  width: number,
  height: number,
): string {
  return lineCoordinates(points, from, to, width, height)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ')
}
