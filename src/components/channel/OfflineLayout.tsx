import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import ChatHeader from '../chat/ChatHeader'
import ChatSource from '../chat/ChatSource'
import ChatStrip from '../chat/ChatStrip'
import FloatingBar from '../chat/FloatingBar'
import FloatingPanel from '../chat/FloatingPanel'
import LandscapeChatHandle from '../chat/LandscapeChatHandle'
import ScaledChat from '../chat/ScaledChat'
import {
  LANDSCAPE_CHAT_BASE,
  LANDSCAPE_CHAT_CLOSED,
  LANDSCAPE_CHAT_OPEN,
  landscapeHandleLabel,
} from '../chat/landscapeChat'
import { useFillScope } from '../chat/useFillScope'
import { useLandscapePhone } from '../chat/useLandscapePhone'
import {
  availableChatHeight,
  floatingHeightCss,
  loadFloatingHeight,
  nextFloatingHeight,
  storeFloatingHeight,
} from '../chat/chatLayout'
import { useFloatingVideo } from '../chat/floatingVideoContext'
import { useChatPlacement } from '../chat/useChatPlacement'
import { useChatPopout } from '../chat/useChatPopout'
import { useYoutubeChatPopout } from '../chat/useYoutubeChatPopout'
import { useChatScale } from '../chat/useChatScale'
import { clampChatWidth, loadChatWidth, storeChatWidth } from '../../lib/offlineLayout'
import { ResizableHandle } from '../layout/ResizableHandle'

/** Default and minimum chat height in the thin layout, in px. The viewer can only make it taller. */
const DEFAULT_HEIGHT = 360
/** The width of the column the restore strip takes when the chat is hidden or popped out, in px (the strip plus its margin). */
const STRIP_COLUMN_PX = 40

// Literal class strings, because Tailwind cannot see classes built from pieces. One grid holds
// the strip, the player (only when unfolded), the chat and the page body. Below `lg` they stack
// in that order; from `lg` the chat is a column of its own that spans every row.
const GRID =
  'grid grid-cols-1 gap-4 w-full max-w-[1600px] mx-auto lg:grid-cols-[minmax(0,1fr)_min(var(--offline-chat-width),50%)]'
const AREAS_FOLDED =
  '[grid-template-areas:"strip"_"chat"_"body"] lg:[grid-template-areas:"strip_chat"_"body_chat"]'
const AREAS_SHOWN =
  '[grid-template-areas:"strip"_"player"_"chat"_"body"] lg:[grid-template-areas:"strip_chat"_"player_chat"_"body_chat"]'

// Landscape phone mode (see landscapePhone.ts), while a recording, clip or stream is playing: the
// root becomes a full-window row (the same elements, restyled, so the player never remounts when
// the phone rotates), the video takes what the chat leaves, and the chat is the shared
// push-in column opened from a handle beside the video.
const ROOT_SIDEWAYS = 'fixed inset-0 z-50 flex flex-row bg-[var(--bg)]'
const PLAYER_SIDEWAYS = 'relative flex-1 min-w-0 overflow-hidden'
const PANEL_SIDEWAYS = 'flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg'

const noop = () => {}

interface OfflineLayoutProps {
  channel: string
  /** The line that stands in for the folded player. */
  strip: ReactNode
  /** The player, when the viewer unfolded it; null while it is folded. */
  player: ReactNode | null
  /** The rest of the page: profile, stats, cards, clips and VODs. */
  children: ReactNode
}

/**
 * The page of a channel that is not live. The chat is ONE element placed by CSS alone, so a
 * window resize between the wide layout (a tall chat column on the right that stays in view)
 * and the thin one (the chat across the top, with a bar to drag it taller) never reloads it.
 * While the player is folded there is no video beside the chat, so the controls that only make
 * sense with one (swap side, the drag grip, Fill, Fullscreen) are not offered.
 */
export default function OfflineLayout({ channel, strip, player, children }: OfflineLayoutProps) {
  const { placement, hide, show } = useChatPlacement()
  const popout = useChatPopout(channel)
  // The streamer may be live on YouTube while offline here; its chat window keeps following this page too.
  const youtubeChat = useYoutubeChatPopout(channel)
  const chatScale = useChatScale()
  const chatVisible = !placement.hidden && !popout.isOpen

  // The pop-out control is for a video that is in the page, so it is not offered while the player
  // is folded. A video that already floats (it was popped out on a live channel and the viewer
  // moved to this one) always gets its way back.
  const video = useFloatingVideo()
  const floating = video.isFloating
  const videoControl =
    (player !== null || floating) && (floating || video.canOpen)
      ? { floating, onClick: floating ? video.close : video.open }
      : null

  // Sideways only while there is a video to give the window to: folded (nothing playing) the
  // page stays the ordinary scrolling page. While the video floats in its own window there is
  // no video to make room around either. The chat's open state is local and never saved.
  const landscape = useLandscapePhone()
  const sideways = landscape && player !== null && !floating
  const [landscapeChatOpen, setLandscapeChatOpen] = useState(false)
  const landscapeOpen = landscapeChatOpen && !popout.isOpen
  useFillScope(sideways ? 'all' : null)
  // Sideways the chat is always in the tree (closed it is a 0px column), whatever was saved.
  const showChat = sideways || chatVisible

  const rootRef = useRef<HTMLDivElement>(null)

  // Wide layout: the chat column's width.
  const [width, setWidth] = useState(loadChatWidth)
  const widthDrag = useRef<number | null>(null)
  const handleWidthResize = (deltaX: number) => {
    const container = rootRef.current?.offsetWidth ?? window.innerWidth
    // Dragging the handle left makes the column wider.
    const next = clampChatWidth((widthDrag.current ?? width) - deltaX, container)
    widthDrag.current = next
    setWidth(next)
  }
  const handleWidthResizeEnd = () => {
    const finished = widthDrag.current
    widthDrag.current = null
    if (finished !== null) storeChatWidth(finished)
  }

  // Thin layout: the chat's height. 0 (nothing stored) means the default, which is also the floor.
  const [height, setHeight] = useState(loadFloatingHeight)
  const heightDrag = useRef<number | null>(null)
  const chatHeight = Math.max(DEFAULT_HEIGHT, height)
  const handleHeightResize = (deltaY: number) => {
    const next = Math.max(
      DEFAULT_HEIGHT,
      nextFloatingHeight(heightDrag.current ?? chatHeight, deltaY, availableChatHeight()),
    )
    heightDrag.current = next
    setHeight(next)
  }
  const handleHeightResizeEnd = () => {
    const finished = heightDrag.current
    heightDrag.current = null
    if (finished === null) return
    // At or below the default there is nothing to remember: the default is the floor.
    const kept = finished > DEFAULT_HEIGHT + 1 ? finished : 0
    setHeight(kept)
    storeFloatingHeight(kept)
  }

  const rootStyle = {
    '--offline-chat-width': `${chatVisible ? width : STRIP_COLUMN_PX}px`,
    '--offline-chat-height': floatingHeightCss(chatHeight),
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      data-testid="offline-layout"
      className={sideways ? ROOT_SIDEWAYS : `${GRID} ${player ? AREAS_SHOWN : AREAS_FOLDED}`}
      style={rootStyle}
    >
      <div className={`min-w-0 [grid-area:strip]${sideways ? ' hidden' : ''}`}>{strip}</div>

      {player && (
        <div
          data-testid="offline-player"
          // min-h-[300px]: the Twitch embed will not go below 300px tall; a shorter 16:9 box crops it.
          className={
            sideways
              ? PLAYER_SIDEWAYS
              : 'relative min-w-0 aspect-video min-h-[300px] max-md:pointer-coarse:min-h-0 overflow-hidden rounded-lg border border-[color:var(--border)] [grid-area:player]'
          }
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          {/* While the video floats the slot holds a panel, never a second player. */}
          {floating ? <FloatingPanel onBringBack={video.close} /> : player}
        </div>
      )}

      {/* Beside the video, never over it: Twitch pauses an embed that anything covers. A
          conditional slot, so the elements around it keep their place in the tree. */}
      {sideways && (
        <LandscapeChatHandle
          side="right"
          open={landscapeOpen}
          label={landscapeHandleLabel(landscapeOpen, popout.isOpen)}
          onToggle={popout.isOpen ? popout.close : () => setLandscapeChatOpen((open) => !open)}
        />
      )}

      <div
        data-testid="chat-cell"
        aria-hidden={sideways && !landscapeOpen ? true : undefined}
        className={
          sideways
            ? `${LANDSCAPE_CHAT_BASE} ${landscapeOpen ? LANDSCAPE_CHAT_OPEN : LANDSCAPE_CHAT_CLOSED}`
            : 'min-w-0 [grid-area:chat] lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:h-[calc(100vh-var(--header-height)-2rem)] lg:self-start'
        }
      >
        {showChat ? (
          <div className="flex h-full min-w-0">
            {!sideways && (
              <div className="hidden lg:flex">
                <ResizableHandle
                  label="Resize chat width"
                  onResize={handleWidthResize}
                  onResizeEnd={handleWidthResizeEnd}
                />
              </div>
            )}
            <div
              data-testid="chat-panel"
              className={
                sideways
                  ? PANEL_SIDEWAYS
                  : 'flex h-[var(--offline-chat-height)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg lg:h-full'
              }
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              {videoControl && <FloatingBar floating={videoControl.floating} onClick={videoControl.onClick} />}
              <ChatHeader
                side="right"
                onHide={sideways ? () => setLandscapeChatOpen(false) : hide}
                onSwapSide={noop}
                onPopOut={popout.open}
                youtubeChat={youtubeChat.available ? { onClick: youtubeChat.open } : null}
                fill={false}
                onToggleFill={noop}
                fullscreenSupported={false}
                isFullscreen={false}
                onToggleFullscreen={noop}
                textSize={{
                  scale: chatScale.scale,
                  canSmaller: chatScale.canSmaller,
                  canLarger: chatScale.canLarger,
                  onSmaller: chatScale.smaller,
                  onLarger: chatScale.larger,
                  onReset: chatScale.reset,
                }}
                dragHandleProps={{}}
                videoControl={videoControl}
                dockControls={false}
                fillControls={false}
              />
              {popout.blocked && (
                <p
                  role="status"
                  className="px-3 py-2 text-xs"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                >
                  Pop-up blocked. Allow pop-ups for this site to use the chat window.
                </p>
              )}
              <div className="min-h-0 flex-1">
                <ScaledChat scale={chatScale.scale}>
                  {/* Sideways and popped out, the chat runs in its own window: no second connection here. */}
                  {!(sideways && popout.isOpen) && <ChatSource channel={channel} />}
                </ScaledChat>
              </div>
              {/* Thin layout only: drag down for a taller chat. A 24px bar, so a finger can hit it. */}
              {!sideways && (
                <div className="shrink-0 lg:hidden">
                  <ResizableHandle
                    direction="vertical"
                    thickness={24}
                    label="Resize chat height"
                    onResize={handleHeightResize}
                    onResizeEnd={handleHeightResizeEnd}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <ChatStrip
            side="right"
            restoreLabel={popout.isOpen ? 'Return chat to the page' : 'Show chat'}
            onRestore={popout.isOpen ? popout.close : show}
            fill={false}
            onToggleFill={noop}
            fullscreenSupported={false}
            isFullscreen={false}
            onToggleFullscreen={noop}
            videoControl={videoControl}
            fillControls={false}
            verticalFrom="lg"
          />
        )}
      </div>

      <div className={`min-w-0 [grid-area:body]${sideways ? ' hidden' : ''}`}>{children}</div>
    </div>
  )
}
