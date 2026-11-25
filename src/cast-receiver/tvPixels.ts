/** A size given for the 720-line screen the page is drawn on, for a part that takes pixels. The rest is CSS `rem`, which scales the same way. */
export function tvPixels(at720: number): number {
  return Math.round((at720 * window.innerHeight) / 720)
}
