import { Link2, X } from 'lucide-react'
import { useRef } from 'react'
import { SmartUrlInput } from '../search/SmartUrlInput'

interface PasteToggleProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** The header's in-flow slot for the box's suggestion list. */
  listContainer: HTMLElement | null
}

/**
 * The header's paste box, behind a link icon until it is wanted. The box stays mounted while closed (mounting it
 * replays the search history into state, which flips its order). From 640 px it opens beside the icon; on a phone it
 * takes the whole bar for the moment, covering the bar's own contents and never the page.
 */
export function PasteToggle({ open, onOpenChange, listContainer }: PasteToggleProps) {
  const iconRef = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    onOpenChange(false)
    iconRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-1">
      <div
        data-paste-box
        className={
          open
            ? 'flex items-center gap-2 max-sm:absolute max-sm:inset-x-2 max-sm:top-1/2 max-sm:z-10 max-sm:-translate-y-1/2 max-sm:bg-[var(--bg-sidebar)] sm:w-64 lg:w-80'
            : 'hidden'
        }
      >
        <div className="min-w-0 flex-1">
          <SmartUrlInput active={open} onDone={close} listContainer={listContainer} />
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close the paste box"
          className="shrink-0 rounded-md p-1.5 transition-colors duration-150 hover:bg-white/10 sm:hidden"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={16} />
        </button>
      </div>
      <button
        ref={iconRef}
        type="button"
        onClick={() => (open ? close() : onOpenChange(true))}
        aria-label="Paste a link"
        aria-expanded={open}
        title="Paste a link"
        className="shrink-0 rounded-md p-1.5 transition-colors duration-150 hover:bg-white/10"
        style={{ color: open ? 'var(--accent-green)' : 'var(--text-secondary)' }}
      >
        <Link2 size={16} />
      </button>
    </div>
  )
}
