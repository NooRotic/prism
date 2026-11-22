import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { availableChatHeight, nextFloatingHeight } from './chatLayout'

/**
 * The height the viewer dragged the dock's row to: 0 is the default, which they can only exceed. The row's height is
 * its minimum, so a taller row is a taller video box and a taller chat beside it. `onResize` and `onResizeEnd` are for
 * a vertical ResizableHandle; `minClass` is the class that gives the row its dragged minimum, taken off for a moment
 * at the start of a drag to read the default height.
 */
export function useHeightDrag(
  rowRef: RefObject<HTMLElement | null>,
  minClass: string,
  load: () => number,
  store: (px: number) => void,
) {
  const [height, setHeight] = useState(load)
  // The drag in progress, kept here rather than read back from the page on every move: a move can arrive before the
  // last one has been drawn.
  const drag = useRef<{ height: number; defaultHeight: number } | null>(null)

  const onResize = useCallback(
    (deltaY: number) => {
      const row = rowRef.current
      if (!row) return
      if (!drag.current) {
        const hadClass = row.classList.contains(minClass)
        if (hadClass) row.classList.remove(minClass)
        const defaultHeight = row.offsetHeight
        if (hadClass) row.classList.add(minClass)
        drag.current = { height: row.offsetHeight, defaultHeight }
      }
      const d = drag.current
      d.height = nextFloatingHeight(d.height, deltaY, availableChatHeight())
      setHeight(d.height)
    },
    [rowRef, minClass],
  )

  const onResizeEnd = useCallback(() => {
    const d = drag.current
    drag.current = null
    if (!d) return
    // At or below the default there is nothing to remember: the default is the floor.
    const kept = d.height > d.defaultHeight + 1 ? d.height : 0
    setHeight(kept)
    store(kept)
  }, [store])

  return { height, onResize, onResizeEnd }
}
