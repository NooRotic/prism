import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { nextRow, ROW_CLOSED, type RowEvent, type RowId, type RowState, type ToolsRowId } from '../lib/headerRow'

/** A pointer passing over the tabs on its way somewhere else opens nothing. */
export const HOVER_OPEN_DELAY_MS = 200
/** Long enough to cross from a tab down into the row. */
export const HOVER_CLOSE_DELAY_MS = 350

/** What, outside this hook, keeps the row open against the pointer leaving or a click outside. */
export interface HeaderRowHolds {
  navPanelOpen: boolean
  browseOpen: boolean
  importing: boolean
}

interface HoverProps {
  onPointerEnter(e: ReactPointerEvent): void
  onPointerLeave(e: ReactPointerEvent): void
}

export interface HeaderRow {
  state: RowState
  /** On each tab that has tools. Mouse pointers only: touch laptops report hover too. */
  tabHoverProps(row: ToolsRowId): HoverProps
  /** On the folding row: entering it keeps a previewed row open, leaving starts the close delay. */
  rowHoverProps: HoverProps
  /** A ▾ or the Accounts pill. `trigger` gets focus back when Esc folds the row. */
  press(row: RowId, trigger?: HTMLElement | null): void
}

/**
 * Drives the header's second row (see lib/headerRow for the rules): hover timers, presses, Esc, clicks outside the
 * header or into a player, page changes, and the header being hidden by fill mode. The caller owns both refs (the
 * returned object carries none, so components can read it during render): `headerRef` on the header, `rowRef` on the
 * folding row, where focus inside holds the row open.
 */
export function useHeaderRow(
  headerRef: RefObject<HTMLElement | null>,
  rowRef: RefObject<HTMLElement | null>,
  holds: HeaderRowHolds,
): HeaderRow {
  const [state, setState] = useState<RowState>(ROW_CLOSED)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  // Focus inside the row holds it only while the viewer is using the keyboard: a mouse click leaves focus on the button
  // it hit, and that must not stop the next click outside from folding the row.
  const focusInside = useRef(false)
  const usingKeyboard = useRef(false)
  // A mouse is over a tab or the row. Tells a hold that ends (a panel closes, an import finishes) whether the pointer
  // is still there to keep the previewed row open or has long gone.
  const pointerOver = useRef(false)

  // The listeners below read the latest values without re-subscribing.
  const holdsRef = useRef(holds)
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    holdsRef.current = holds
    stateRef.current = state
  })

  // Worked out when an event arrives, never cached: whether anything is holding the row open right now.
  const send = useCallback((event: RowEvent) => {
    const h = holdsRef.current
    // An import holds only the Accounts row, where its progress and result show. Any other row has no reason to stay.
    const importHold = h.importing && stateRef.current.open === 'accounts'
    const held = h.navPanelOpen || h.browseOpen || importHold || (focusInside.current && usingKeyboard.current)
    setState((s) => nextRow(s, event, held))
  }, [])

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const scheduleClose = useCallback(() => {
    clearTimer()
    timer.current = setTimeout(() => send({ type: 'hoverClose' }), HOVER_CLOSE_DELAY_MS)
  }, [clearTimer, send])

  // A previewed row that something was holding open folds once the hold is gone, unless the pointer is still over it.
  // Pinned rows stay, and `hoverClose` looks at the holds again when the timer fires, so a hold that is still there wins.
  const foldIfIdle = useCallback(() => {
    const s = stateRef.current
    if (s.open === null || s.pinned || pointerOver.current) return
    scheduleClose()
  }, [scheduleClose])

  const tabHoverProps = useCallback(
    (row: ToolsRowId): HoverProps => ({
      onPointerEnter: (e) => {
        if (e.pointerType !== 'mouse') return
        pointerOver.current = true
        clearTimer()
        timer.current = setTimeout(() => send({ type: 'hoverOpen', row }), HOVER_OPEN_DELAY_MS)
      },
      onPointerLeave: (e) => {
        if (e.pointerType !== 'mouse') return
        pointerOver.current = false
        scheduleClose()
      },
    }),
    [clearTimer, scheduleClose, send],
  )

  const rowHoverProps: HoverProps = {
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse') return
      pointerOver.current = true
      clearTimer()
    },
    onPointerLeave: (e) => {
      if (e.pointerType !== 'mouse') return
      pointerOver.current = false
      scheduleClose()
    },
  }

  const press = useCallback(
    (row: RowId, el?: HTMLElement | null) => {
      clearTimer()
      trigger.current = el ?? null
      send({ type: 'press', row })
    },
    [clearTimer, send],
  )

  // Focus inside the row holds it open, but only for a keyboard user working its buttons (see `send`). Which input the
  // viewer is using is noted in the capture phase, before any other listener acts on the event.
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const onIn = () => {
      focusInside.current = true
    }
    const onOut = (e: FocusEvent) => {
      if (el.contains(e.relatedTarget as Node | null)) return
      focusInside.current = false
      foldIfIdle()
    }
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    return () => {
      el.removeEventListener('focusin', onIn)
      el.removeEventListener('focusout', onOut)
    }
  }, [rowRef, foldIfIdle])

  useEffect(() => {
    const onKeyInput = () => {
      usingKeyboard.current = true
    }
    const onPointerInput = () => {
      usingKeyboard.current = false
    }
    document.addEventListener('keydown', onKeyInput, true)
    document.addEventListener('pointerdown', onPointerInput, true)
    return () => {
      document.removeEventListener('keydown', onKeyInput, true)
      document.removeEventListener('pointerdown', onPointerInput, true)
    }
  }, [])

  // Esc goes to the innermost open thing first: an open slide-down panel, Browse or the paste box closes itself, and
  // only the next Esc folds the row (focus then goes back to the button that opened it). Read in the capture phase,
  // before those inner handlers run: in a real browser React applies their close between its own handler and a
  // bubble-phase document listener, which would then see nothing open and fold the row on the same key press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (holdsRef.current.navPanelOpen || holdsRef.current.browseOpen) return
      if (e.target instanceof Element && e.target.closest('[data-paste-box]')) return
      if (stateRef.current.open === null) return
      // Focus goes back to the button that pinned the row. A row the pointer merely previewed was opened by no button,
      // and the one `trigger` remembers belongs to an earlier press.
      const wasPinned = stateRef.current.pinned
      send({ type: 'dismiss' })
      if (wasPinned) trigger.current?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [send])

  // A click outside the header folds the row. A click into a player never reaches the document (it lands in an
  // iframe), but the window loses focus to it: check what has focus once the blur has settled.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return
      send({ type: 'outside' })
    }
    let blurTimer: ReturnType<typeof setTimeout> | null = null
    const onBlur = () => {
      if (blurTimer) clearTimeout(blurTimer)
      blurTimer = setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') send({ type: 'outside' })
      }, 0)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('blur', onBlur)
      if (blurTimer) clearTimeout(blurTimer)
    }
  }, [headerRef, send])

  // Whatever was holding a previewed row open has let go: fold it now, not at the next click outside.
  const { navPanelOpen, browseOpen, importing } = holds
  useEffect(() => {
    foldIfIdle()
  }, [navPanelOpen, browseOpen, importing, foldIfIdle])

  // A page change folds the row.
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (pathname === lastPath.current) return
    lastPath.current = pathname
    clearTimer()
    send({ type: 'dismiss' })
  }, [pathname, clearTimer, send])

  // Fill mode hides the header: fold the row, so it is closed (not still open) when the header comes back.
  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (el.offsetHeight === 0) send({ type: 'dismiss' })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [headerRef, send])

  useEffect(() => clearTimer, [clearTimer])

  return { state, tabHoverProps, rowHoverProps, press }
}
