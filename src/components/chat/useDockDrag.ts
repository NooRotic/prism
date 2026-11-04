import { useEffect, useState } from 'react'
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'
import { sideForPoint } from './chatLayout'
import type { DockSide } from './chatPlacement'

interface UseDockDragReturn {
  dragging: boolean
  /** The side the chat would dock to if released now; null when not dragging. */
  hoverSide: DockSide | null
  handleProps: HTMLAttributes<HTMLElement>
}

function isInsideWindow(clientX: number, clientY: number): boolean {
  return clientX >= 0 && clientX <= window.innerWidth && clientY >= 0 && clientY <= window.innerHeight
}

/**
 * Drag a handle to the other side of the page ("plain snapping": on release the
 * chat docks to whichever half the pointer is in). Pointer capture, the same
 * way ResizableHandle works, keeps move and up events flowing while the cursor
 * is over the cross-origin player iframe, where ordinary or native drag events
 * would stop reaching the page. Nothing is drawn following the cursor: a ghost
 * panel across the video would sit over the embed.
 *
 * A release outside the window, a pointercancel and Escape all end the drag
 * without docking anywhere.
 */
export function useDockDrag(onDrop: (side: DockSide) => void): UseDockDragReturn {
  const [hoverSide, setHoverSide] = useState<DockSide | null>(null)
  const dragging = hoverSide !== null

  useEffect(() => {
    if (!dragging) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHoverSide(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dragging])

  const handleProps: HTMLAttributes<HTMLElement> = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button > 0) return // primary button, touch or pen only
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        // The pointer was released before this ran. Capture is only what keeps
        // the drag tracking over the iframe, so the drag still starts without it.
      }
      setHoverSide(sideForPoint(e.clientX, window.innerWidth))
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragging) return
      setHoverSide(sideForPoint(e.clientX, window.innerWidth))
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragging) return
      setHoverSide(null)
      if (isInsideWindow(e.clientX, e.clientY)) {
        onDrop(sideForPoint(e.clientX, window.innerWidth))
      }
    },
    onPointerCancel: () => {
      setHoverSide(null)
    },
    style: { touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' },
  }

  return { dragging, hoverSide, handleProps }
}
