import { createContext, useContext, useEffect, useRef } from 'react'
import { buildPopoutPlayerPath } from '../../lib/floatingVideo'
import type { FramedSource } from '../../lib/floatingVideo'

/** What the rest of the app may know about the floating video window, and ask of it. */
export interface FloatingVideoControls {
  /** The browser can open a floating window at all. */
  supported: boolean
  /** Supported, not already floating, and on a live Twitch channel page or a page that has said what video it shows. */
  canOpen: boolean
  /** A window exists right now. Derived from the window itself, so a closed window cannot leave this true. */
  isFloating: boolean
  /** The browser refused the last request. Clears itself after a few seconds. */
  blocked: boolean
  /** The window opened but the player could not start in it, so it was closed. Clears itself too. */
  failed: boolean
  /**
   * Must run inside a click: the browser only opens the window for one. `startSec` is where a YouTube video
   * continues from. Anything else passed in (a click handler hands over its event) is ignored.
   */
  open: (options?: { startSec?: number }) => void
  close: () => void
  /** A YouTube or HLS / DASH page says which video it shows (null when it shows none). Pages use `useFloatingPageSource`. */
  registerSource: (source: FramedSource | null) => void
}

/** Outside a provider nothing is offered, so components and tests that never mount one behave as before. */
const INERT: FloatingVideoControls = {
  supported: false,
  canOpen: false,
  isFloating: false,
  blocked: false,
  failed: false,
  open: () => {},
  close: () => {},
  registerSource: () => {},
}

export const FloatingVideoContext = createContext<FloatingVideoControls>(INERT)

export function useFloatingVideo(): FloatingVideoControls {
  return useContext(FloatingVideoContext)
}

/**
 * Called by a page that plays a video of its own (YouTube, HLS / DASH): lets the pop-out button open the window on
 * it, and lets an open window follow the page to the next video. The page names no start time; the click supplies it.
 */
export function useFloatingPageSource(source: FramedSource | null): void {
  const { registerSource } = useFloatingVideo()
  const sourceRef = useRef(source)
  useEffect(() => {
    sourceRef.current = source
  })
  const key = source ? buildPopoutPlayerPath(source) : ''
  useEffect(() => {
    registerSource(sourceRef.current)
    return () => registerSource(null)
  }, [key, registerSource])
}
