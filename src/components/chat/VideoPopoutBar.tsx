import { STRIP_BUTTON_LOOK } from './ChatTab'
import { useFloatingVideo } from './floatingVideoContext'
import VideoPopoutButton from './VideoPopoutButton'

interface VideoPopoutBarProps {
  /** Where a YouTube video continues from, read at the click. Nothing to read means it starts from the beginning. */
  getStartSec?: () => number | undefined
}

/**
 * The pop-out button for a page that plays a video of its own (YouTube, HLS / DASH), with the notice when the window
 * would not open or could not start. It sits beside the player, never over it, and is absent where the browser
 * cannot float a video.
 */
export default function VideoPopoutBar({ getStartSec }: VideoPopoutBarProps) {
  const video = useFloatingVideo()
  if (!video.isFloating && !video.canOpen) return null
  const notice = video.failed
    ? "The video couldn't start in the floating window, so it was closed. Click the button to try again."
    : video.blocked
      ? "Couldn't open the floating window. Click the button again."
      : null
  return (
    <div className="flex items-center justify-end gap-3">
      {notice && (
        <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {notice}
        </p>
      )}
      <VideoPopoutButton
        floating={video.isFloating}
        onClick={video.isFloating ? video.close : () => video.open({ startSec: getStartSec?.() })}
        className={`${STRIP_BUTTON_LOOK} h-9 w-9`}
        size={16}
      />
    </div>
  )
}
