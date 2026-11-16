import type { DockSide } from './chatPlacement'

interface Point {
  x: number
  y: number
}

/** The shortest horizontal drag that counts as a swipe. */
const MIN_SWIPE_PX = 40

/**
 * What a drag on the chat handle means. The chat slides in from its own edge, so a swipe
 * toward the page's middle opens it and a swipe back toward the edge closes it. A short or
 * mostly vertical drag (a scroll, a stray touch) means nothing.
 */
export function swipeIntent(start: Point, end: Point, side: DockSide): 'open' | 'close' | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return null
  const towardMiddle = side === 'right' ? dx < 0 : dx > 0
  return towardMiddle ? 'open' : 'close'
}
