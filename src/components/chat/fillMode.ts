/**
 * The attribute ChatDock puts on the page root while fill mode is in effect.
 * Elements marked with the `fill-hide` class are hidden by it (see index.css),
 * so the page chrome goes away without being unmounted. It exists only while
 * the dock is mounted, which is only on the Twitch player page.
 */
export const FILL_ATTRIBUTE = 'data-fill'

/**
 * `md`: the fill layout applies from Tailwind's md breakpoint up (chat is docked,
 * so below that the stacked layout stays). `all`: it applies at every width (chat is
 * hidden or popped out, so there is no side-by-side layout to conflict).
 */
export type FillScope = 'md' | 'all'

/** Only the exact string `true` counts; anything else saved is treated as off. */
export function parseFill(raw: string | null): boolean {
  return raw === 'true'
}

/**
 * Which width rule applies, or null when neither the remembered fill setting
 * nor fullscreen is on. Fullscreen counts on its own without changing the
 * remembered setting.
 */
export function fillScopeFor(input: {
  fill: boolean
  fullscreen: boolean
  chatDocked: boolean
}): FillScope | null {
  if (!input.fill && !input.fullscreen) return null
  return input.chatDocked ? 'md' : 'all'
}
