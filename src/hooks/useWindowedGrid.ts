import { useLayoutEffect, useRef, useState } from 'react'
import { windowRange } from '../lib/windowRange'

interface Options {
  itemCount: number
  /** The height of one row of cards, gap included. */
  rowHeight: number
  /** The narrowest a card may get; the number of columns is as many as fit. */
  minCardWidth: number
  /** Extra rows kept mounted above and below the view. */
  overscan?: number
}

/** Used until the box has been measured, so the first paint already has cards in it. */
const FALLBACK_VIEWPORT = 600

/**
 * Windowing for a grid of equally tall cards: which items to mount, how tall the whole list is, and how far down the
 * mounted rows sit. Attach `containerRef` to the scrolling box; it listens for scrolling and for the box changing size.
 */
export function useWindowedGrid({ itemCount, rowHeight, minCardWidth, overscan = 2 }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }
    const onScroll = () => setScrollTop(el.scrollTop)
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const columns = Math.max(1, Math.floor(size.width / Math.max(1, minCardWidth)))
  const rowCount = Math.ceil(itemCount / columns)
  const { firstRow, endRow } = windowRange({
    scrollTop,
    viewportHeight: size.height > 0 ? size.height : FALLBACK_VIEWPORT,
    rowHeight,
    rowCount,
    overscan,
  })

  return {
    containerRef,
    columns,
    totalHeight: rowCount * rowHeight,
    firstIndex: firstRow * columns,
    endIndex: Math.min(itemCount, endRow * columns),
    offsetY: firstRow * rowHeight,
    /** For the caller to put the box back at the top when it shows a different list. */
    resetScroll: () => {
      const el = containerRef.current
      if (el) el.scrollTop = 0
      setScrollTop(0)
    },
  }
}
