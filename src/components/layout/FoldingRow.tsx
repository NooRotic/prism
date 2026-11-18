import { useState, type ReactNode, type RefObject } from 'react'
import type { HeaderRow } from '../../hooks/useHeaderRow'

interface FoldingRowProps {
  open: boolean
  row: HeaderRow
  /** The row's own element (useHeaderRow watches focus inside it). */
  rowRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

/**
 * The header's second row. It is part of the header, never drawn over the page: opening it makes the header taller,
 * `--header-height` follows, and the page underneath moves down (Twitch pauses a player that anything covers).
 * It clips its content while it unfolds, then lets drop-downs (Browse) hang out of it once it has settled open.
 */
export function FoldingRow({ open, row, rowRef, children }: FoldingRowProps) {
  // Set when a fold or unfold finishes, so a re-open clips again until it has settled.
  const [settledOpen, setSettledOpen] = useState(false)
  const overflowVisible = open && settledOpen
  return (
    <div
      id="header-row"
      ref={rowRef}
      className="header-fold"
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      inert={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setSettledOpen(open)
      }}
      {...row.rowHoverProps}
    >
      <div className={`min-h-0 ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
        <div
          className="flex min-h-10 flex-wrap items-center gap-1 px-3 py-1.5 sm:px-6"
          style={{ background: 'rgba(10, 10, 15, 0.9)', borderTop: '1px solid var(--border)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
