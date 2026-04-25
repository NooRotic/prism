import { useCallback, useRef } from 'react'

interface ResizableHandleProps {
  /** Called continuously during drag with the delta in px from drag start */
  onResize: (deltaX: number) => void
  /** Called when drag ends */
  onResizeEnd?: () => void
  /** Direction of resize. Default 'horizontal' */
  direction?: 'horizontal' | 'vertical'
}

export function ResizableHandle({
  onResize,
  onResizeEnd,
  direction = 'horizontal',
}: ResizableHandleProps) {
  const startPos = useRef(0)
  const isDragging = useRef(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDragging.current = true
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [direction],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const current = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = current - startPos.current
      onResize(delta)
      startPos.current = current
    },
    [direction, onResize],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
    onResizeEnd?.()
  }, [onResizeEnd])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="shrink-0 flex items-center justify-center group touch-none select-none"
      style={{
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        width: isHorizontal ? '8px' : '100%',
        height: isHorizontal ? '100%' : '8px',
        zIndex: 10,
      }}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      tabIndex={0}
    >
      {/* Visible drag indicator */}
      <div
        className="rounded-full transition-colors group-hover:bg-[var(--accent-green)] group-active:bg-[var(--accent-green)]"
        style={{
          backgroundColor: 'var(--border-accent)',
          width: isHorizontal ? '3px' : '40px',
          height: isHorizontal ? '40px' : '3px',
        }}
      />
    </div>
  )
}
