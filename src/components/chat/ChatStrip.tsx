import { Expand, Maximize2, Minimize2, Shrink } from 'lucide-react'
import ChatTab, { STRIP_BUTTON_LOOK } from './ChatTab'
import VideoPopoutButton from './VideoPopoutButton'
import type { VideoControl } from './VideoPopoutButton'
import type { DockSide } from './chatPlacement'

interface ChatStripProps {
  side: DockSide
  /** `Show chat` when hidden, `Return chat to the page` when popped out. */
  restoreLabel: string
  onRestore: () => void
  fill: boolean
  onToggleFill: () => void
  fullscreenSupported: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
  /** Pop out / bring back the video. Omitted or null when the video cannot be popped out here. */
  videoControl?: VideoControl | null
  /** False when there is no video to fill or fullscreen with the chat (an offline channel): both buttons go. Defaults to true. */
  fillControls?: boolean
  /** The width from which the strip is a column beside the page rather than a bar across it. Default `md`; the offline layout stacks until `lg`. */
  verticalFrom?: 'md' | 'lg'
}

// Literal class strings, because Tailwind cannot see classes built from pieces.
const STRIP_LAYOUT = {
  md: 'flex-row-reverse md:flex-col w-full h-9 mt-2 md:mt-0 md:w-8 md:h-auto',
  lg: 'flex-row-reverse lg:flex-col w-full h-9 lg:w-8 lg:h-auto',
} as const
const STRIP_SIDE_MARGIN = {
  md: { right: 'md:ml-2', left: 'md:mr-2' },
  lg: { right: 'lg:ml-2', left: 'lg:mr-2' },
} as const

const SMALL_BUTTON = `${STRIP_BUTTON_LOOK} shrink-0 w-9 h-9 md:w-8 md:h-8`

/**
 * The strip beside the player when the chat is hidden or popped out: restore the
 * chat, fill the window, fullscreen. It is a column of its own from md and a bar
 * below it, never shown over the embed, and never hidden, so fill mode always
 * has a visible way out. The toggles are one element each whose label changes,
 * so a clicked button keeps its focus.
 */
export default function ChatStrip({
  side,
  restoreLabel,
  onRestore,
  fill,
  onToggleFill,
  fullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
  videoControl = null,
  fillControls = true,
  verticalFrom = 'md',
}: ChatStripProps) {
  const fillLabel = fill ? 'Exit fill mode' : 'Fill window'
  const fullscreenLabel = isFullscreen ? 'Exit fullscreen' : 'Fullscreen chat and video'
  return (
    <div
      data-testid="chat-strip"
      className={`shrink-0 flex gap-1 ${STRIP_LAYOUT[verticalFrom]} ${STRIP_SIDE_MARGIN[verticalFrom][side]}`}
    >
      {fillControls && (
        <button
          type="button"
          onClick={onToggleFill}
          aria-label={fillLabel}
          title={fillLabel}
          aria-pressed={fill}
          className={SMALL_BUTTON}
        >
          {fill ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      {fillControls && fullscreenSupported && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
          aria-pressed={isFullscreen}
          className={SMALL_BUTTON}
        >
          {isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}
        </button>
      )}
      {videoControl && (
        <VideoPopoutButton
          floating={videoControl.floating}
          onClick={videoControl.onClick}
          className={SMALL_BUTTON}
          size={16}
        />
      )}
      <ChatTab side={side} label={restoreLabel} onClick={onRestore} />
    </div>
  )
}
