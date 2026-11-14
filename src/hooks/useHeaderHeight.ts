import { useLayoutEffect, type RefObject } from 'react'

/**
 * Publishes the header's real height as `--header-height` on the page, and keeps it up to date as the header resizes.
 * Everything that sits under the header (the slide-down panels, the channel rail, full-height pages) reads that variable.
 * The header is one row on a wide screen and wraps onto a second on a phone, so its height is no longer a constant. A header
 * with no height (not displayed) leaves the variable alone, and unmounting gives the CSS default back.
 */
export function useHeaderHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const apply = () => {
      const height = el.offsetHeight
      if (height > 0) root.style.setProperty('--header-height', `${height}px`)
    }
    apply()
    // The header changes height when the window resizes (it wraps) and when the sign-in state changes (the nav appears):
    // the observer sees both. A window resize is listened for as well, because a page that is not being painted (a hidden
    // pane, a background tab) gets no observer calls.
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(apply)
      observer.observe(el)
    }
    window.addEventListener('resize', apply)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--header-height')
    }
  }, [ref])
}
