export interface WindowInput {
  /** How far the box has been scrolled, in pixels. */
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  rowCount: number
  /** Extra rows kept mounted above and below the ones in view, so a fast scroll does not show gaps. */
  overscan: number
}

/**
 * Which rows of a long, evenly tall list are worth mounting: `[firstRow, endRow)`. A scroll position past the end
 * (the list just got shorter and the browser has not caught up) shows the end of the list; a list with no rows shows
 * none; and at least one row is always asked for when there are any, so a box that has not been measured yet still draws.
 */
export function windowRange({ scrollTop, viewportHeight, rowHeight, rowCount, overscan }: WindowInput): {
  firstRow: number
  endRow: number
} {
  if (rowCount <= 0) return { firstRow: 0, endRow: 0 }
  const height = Math.max(1, rowHeight)
  const view = Math.max(0, viewportHeight)
  const over = Math.max(0, Math.floor(overscan))
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, rowCount * height - view))

  const firstVisible = Math.floor(top / height)
  const endVisible = Math.ceil((top + view) / height)
  return {
    firstRow: Math.max(0, firstVisible - over),
    endRow: Math.min(rowCount, Math.max(endVisible + over, firstVisible + 1)),
  }
}
