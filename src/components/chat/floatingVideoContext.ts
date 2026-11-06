import { createContext, useContext } from 'react'

/** What the rest of the app may know about the floating video window, and ask of it. */
export interface FloatingVideoControls {
  /** The browser can open a floating window at all. */
  supported: boolean
  /** Supported, not already floating, and on a live Twitch channel page. */
  canOpen: boolean
  /** A window exists right now. Derived from the window itself, so a closed window cannot leave this true. */
  isFloating: boolean
  /** The browser refused the last request. Clears itself after a few seconds. */
  blocked: boolean
  /** Must run inside a click: the browser only opens the window for one. */
  open: () => void
  close: () => void
}

/** Outside a provider nothing is offered, so components and tests that never mount one behave as before. */
const INERT: FloatingVideoControls = {
  supported: false,
  canOpen: false,
  isFloating: false,
  blocked: false,
  open: () => {},
  close: () => {},
}

export const FloatingVideoContext = createContext<FloatingVideoControls>(INERT)

export function useFloatingVideo(): FloatingVideoControls {
  return useContext(FloatingVideoContext)
}
