import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'

interface UseFullscreenReturn {
  /** False when the browser has no Fullscreen API or fullscreen is not allowed here. */
  supported: boolean
  /** True only while the given element itself is the fullscreen element. */
  isFullscreen: boolean
  toggle: () => void
}

/**
 * Fullscreen for one element (the dock row, so the video and the chat go
 * fullscreen together). Only that element counts: Twitch's own fullscreen
 * button fullscreens its player iframe, and that must not flip our state.
 * Requests can be refused or fail, and that changes nothing.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const supported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true &&
    typeof HTMLElement.prototype.requestFullscreen === 'function'

  useEffect(() => {
    const sync = () => setIsFullscreen(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    try {
      const pending =
        document.fullscreenElement === el ? document.exitFullscreen() : el.requestFullscreen()
      // A refused or failed request leaves things as they were.
      Promise.resolve(pending).catch(() => {})
    } catch {
      // the API threw synchronously — same outcome
    }
  }, [ref])

  return { supported, isFullscreen, toggle }
}
