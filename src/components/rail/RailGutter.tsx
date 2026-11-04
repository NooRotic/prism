import type { ReactNode } from 'react'

/**
 * CSS custom properties through which the rail reports the page-edge width
 * it covers. ChannelRail sets one of them on :root while it is on screen;
 * index.css defaults both to 0px. Variables rather than props because the
 * rail owns its own edge preference and mounts once, outside the routes.
 */
export const RAIL_RESERVE_LEFT_VAR = '--rail-reserve-left'
export const RAIL_RESERVE_RIGHT_VAR = '--rail-reserve-right'

interface RailGutterProps {
  /** Reserve the rail's edge. Player pages only; elsewhere it just overlays. */
  active: boolean
  children: ReactNode
}

/**
 * Wraps the route content so that, on player pages, nothing sits under the
 * rail. Twitch refuses to autoplay an embed that anything is drawn over (a
 * 28px button was enough, verified 2026-11-03), so the rail's collapsed strip
 * can't be allowed to cover the video's edge.
 *
 * Only the rail's own edge pays: the other side stays at 0. Expanding the
 * rail (hover/focus/tap) still overlays rather than reflowing the page; an
 * embed that is covered by that stays visible to Twitch again, and starts
 * playing, as soon as the rail collapses.
 */
export default function RailGutter({ active, children }: RailGutterProps) {
  return (
    <div
      data-testid="rail-gutter"
      className={active ? 'pl-(--rail-reserve-left) pr-(--rail-reserve-right)' : undefined}
    >
      {children}
    </div>
  )
}
