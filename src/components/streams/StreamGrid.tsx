import { useEffect, useRef, type ReactNode } from 'react'
import { useWindowedGrid } from '../../hooks/useWindowedGrid'
import type { StreamEntry } from '../../lib/streamsApi'

const GAP = 12

interface StreamGridProps {
  streams: StreamEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Draws one card. It should fill the cell it is given and call `onSelect` itself when chosen. */
  renderCard: (stream: StreamEntry, selected: boolean) => ReactNode
  /** The height of a row of cards, gap included. */
  rowHeight?: number
  minCardWidth?: number
}

/**
 * A scrolling box of cards that mounts only the rows in view, so thousands of streams cost a few dozen elements.
 * `onSelect` is part of the grid's props so a caller wires one handler for the list; the cards call it.
 */
export default function StreamGrid({ streams, selectedId, renderCard, rowHeight = 108, minCardWidth = 280 }: StreamGridProps) {
  const { containerRef, columns, totalHeight, firstIndex, endIndex, offsetY, resetScroll } = useWindowedGrid({
    itemCount: streams.length,
    rowHeight,
    minCardWidth,
  })

  // A different list (a search, a group) starts at its top, not wherever the last one was scrolled to.
  const shown = useRef(streams)
  useEffect(() => {
    if (shown.current !== streams) {
      shown.current = streams
      resetScroll()
    }
  })

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Stream list"
      tabIndex={0}
      className="max-h-[70vh] overflow-y-auto rounded-lg"
      style={{ overscrollBehavior: 'contain' }}
    >
      {streams.length === 0 ? (
        <p className="px-3 py-8 text-center text-[var(--text-secondary)]">No streams match.</p>
      ) : (
        <div data-grid-spacer style={{ height: totalHeight, position: 'relative' }}>
          <div
            role="list"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${offsetY}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
              paddingBottom: 0,
            }}
          >
            {streams.slice(firstIndex, endIndex).map((stream) => (
              <div key={stream.id} role="listitem" style={{ height: rowHeight - GAP }}>
                {renderCard(stream, stream.id === selectedId)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
