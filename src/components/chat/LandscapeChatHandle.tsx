import { useRef } from 'react'
import type { TouchEvent } from 'react'
import { MessageSquare } from 'lucide-react'
import { STRIP_BUTTON_LOOK } from './ChatTab'
import { swipeIntent } from './landscapeSwipe'
import type { DockSide } from './chatPlacement'

interface LandscapeChatHandleProps {
  side: DockSide
  open: boolean
  /** `Show chat`, `Hide chat`, or `Return chat to the page` when the chat is popped out. */
  label: string
  onToggle: () => void
}

/**
 * The slim column beside the video that slides the chat in and out when the phone is held
 * sideways. Never drawn over the video: Twitch pauses an embed that anything covers, so
 * this is a sibling column of the player wrapper. 44px wide, the touch-target minimum.
 * A tap toggles; so does a swipe toward the chat's opening direction while it is closed,
 * or back toward its edge while it is open.
 */
export default function LandscapeChatHandle({ side, open, label, onToggle }: LandscapeChatHandleProps) {
  const start = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    start.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const onTouchEnd = (event: TouchEvent) => {
    const from = start.current
    const touch = event.changedTouches[0]
    start.current = null
    if (!from || !touch) return
    const intent = swipeIntent(from, { x: touch.clientX, y: touch.clientY }, side)
    if ((intent === 'open' && !open) || (intent === 'close' && open)) onToggle()
  }

  return (
    <div
      data-testid="landscape-chat-handle"
      className="shrink-0 w-11 flex flex-col p-1"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        title={label}
        aria-expanded={open}
        data-side={side}
        className={`${STRIP_BUTTON_LOOK} flex-1 min-h-11 min-w-0`}
      >
        <MessageSquare size={18} />
      </button>
    </div>
  )
}
