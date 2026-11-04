import {
  ArrowLeft,
  ArrowRight,
  Expand,
  ExternalLink,
  GripVertical,
  Maximize2,
  Minimize2,
  Shrink,
  X,
} from 'lucide-react'
import type { HTMLAttributes } from 'react'
import type { DockSide } from './chatPlacement'

interface ChatHeaderProps {
  side: DockSide
  onHide: () => void
  onSwapSide: () => void
  onPopOut: () => void
  fill: boolean
  onToggleFill: () => void
  fullscreenSupported: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
  /** Pointer handlers and style from useDockDrag, applied to the drag handle. */
  dragHandleProps: HTMLAttributes<HTMLElement>
}

const buttonClass = 'rounded-md p-1 transition-colors hover:bg-white/5'
const toggleClass = `${buttonClass} aria-pressed:text-[color:var(--accent-green)]`

/** Placement controls. Hidden below md, where the layout is always stacked. */
export default function ChatHeader({
  side,
  onHide,
  onSwapSide,
  onPopOut,
  fill,
  onToggleFill,
  fullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
  dragHandleProps,
}: ChatHeaderProps) {
  const target: DockSide = side === 'left' ? 'right' : 'left'
  const fillLabel = fill ? 'Exit fill mode' : 'Fill window'
  const fullscreenLabel = isFullscreen ? 'Exit fullscreen' : 'Fullscreen chat and video'
  return (
    <div
      data-testid="chat-header"
      className="hidden md:flex items-center justify-between gap-1 px-2 py-1"
      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
    >
      <span
        {...dragHandleProps}
        title="Drag to dock the chat on the other side"
        className="flex items-center gap-1 text-xs select-none"
      >
        <GripVertical size={14} />
        Chat
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleFill}
          aria-label={fillLabel}
          title={fillLabel}
          aria-pressed={fill}
          className={toggleClass}
        >
          {fill ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        {fullscreenSupported && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            aria-pressed={isFullscreen}
            className={toggleClass}
          >
            {isFullscreen ? <Shrink size={14} /> : <Expand size={14} />}
          </button>
        )}
        <button
          type="button"
          onClick={onSwapSide}
          aria-label={`Move chat to the ${target}`}
          title={`Move chat to the ${target}`}
          className={buttonClass}
        >
          {target === 'left' ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
        </button>
        <button
          type="button"
          onClick={onPopOut}
          aria-label="Pop out chat"
          title="Pop out chat into its own window"
          className={buttonClass}
        >
          <ExternalLink size={14} />
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide chat"
          title="Hide chat"
          className={buttonClass}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
