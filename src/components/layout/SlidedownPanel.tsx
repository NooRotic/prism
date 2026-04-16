import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import type { NavPanelId } from '../../contexts/AppContext'

interface SlidedownPanelProps {
  /** Which `state.navPanel.open` value activates this panel. */
  panelId: NavPanelId
  /** Accessible label announced by screen readers. */
  ariaLabel: string
  /** Panel content — renders inside the centered inner container.
   *  Consumers define their own header row (with close button) and
   *  body content; the base only owns the positioning/animation
   *  shell and the close behaviors. */
  children: ReactNode
}

/**
 * Shared slide-down panel shell extracted from FollowingPanel,
 * YourStatsPanel, and CategoryPanel. Owns the pieces that were
 * duplicated ~150 lines × 3 files:
 *
 * - Fixed positioning below the header with `translateY` animation
 * - `brushed-metal` surface class (SVG turbulence background)
 * - Close behaviors: ESC key, click-outside (with `[data-nav-trigger]`
 *   carve-out so the header nav button's own toggle handler wins)
 * - ARIA attributes: `role="region"`, `aria-hidden` when closed,
 *   `aria-label` from props
 * - `pointerEvents: none` when closed so the hidden panel can't
 *   intercept clicks on content beneath it
 * - Max-width inner container with responsive padding
 *
 * Consumers pass `panelId` (to tie into `state.navPanel.open`) and
 * `ariaLabel`, then provide their unique header + body as children.
 * The base's `close` callback is NOT exposed — consumers dispatch
 * `CLOSE_NAV_PANEL` themselves via their own `useApp()` hook for
 * their close button, which keeps the API minimal and lets each
 * panel compose its own button cluster (e.g. refresh + close,
 * refresh + twitch directory + close) without needing to route
 * through the base.
 */
export default function SlidedownPanel({
  panelId,
  ariaLabel,
  children,
}: SlidedownPanelProps) {
  const { state, dispatch } = useApp()
  const panelRef = useRef<HTMLDivElement>(null)
  const isOpen = state.navPanel.open === panelId

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch])

  // Scroll to top when opening so the panel content is visible,
  // especially on the landing page where the user may have scrolled.
  useEffect(() => {
    if (isOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isOpen])

  // ESC key closes the panel when it's open
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, close])

  // Click-outside closes — but carve out the header nav button so
  // its own toggle handler runs instead. The nav button container
  // marks itself with `data-nav-trigger` for exactly this purpose.
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current && !panelRef.current.contains(target)) {
        const headerNav = document.querySelector('[data-nav-trigger]')
        if (headerNav && headerNav.contains(target)) return
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, close])

  return (
    <div
      ref={panelRef}
      aria-hidden={!isOpen}
      aria-label={ariaLabel}
      role="region"
      className="brushed-metal absolute left-0 right-0 overflow-y-auto transition-transform duration-300 ease-out"
      style={{
        top: '100%',
        minHeight: '40vh',
        maxHeight: 'calc(100vh - var(--header-height, 56px))',
        // z-9 sits below the header (z-10) so the header visually
        // "covers" the top edge as the panel slides out from under it.
        zIndex: 9,
        // No backgroundColor inline — brushed-metal class provides it.
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        transform: isOpen ? 'translateY(0)' : 'translateY(-100%)',
        // When closed, forbid pointer events so the hidden panel
        // doesn't intercept clicks on content beneath it.
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-4">
        {children}
      </div>
    </div>
  )
}
