import { PictureInPicture2 } from 'lucide-react'
import { STRIP_BUTTON_LOOK } from './ChatTab'

interface FloatingPanelProps {
  onBringBack: () => void
}

/**
 * Stands in for the video while it floats and there is no chat to take its
 * place (the chat is hidden or popped out). It replaces the player rather than
 * sitting over it, since nothing may be drawn over a playing embed.
 */
export default function FloatingPanel({ onBringBack }: FloatingPanelProps) {
  return (
    <div
      data-testid="floating-panel"
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center"
      style={{ color: 'var(--text-muted)' }}
    >
      <PictureInPicture2 size={32} />
      <p className="text-sm">The video is in a floating window</p>
      <button
        type="button"
        onClick={onBringBack}
        className={`${STRIP_BUTTON_LOOK} h-9 px-3 text-sm`}
      >
        Bring video back
      </button>
    </div>
  )
}
