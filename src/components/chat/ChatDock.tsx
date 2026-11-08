import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ResizableHandle } from '../layout/ResizableHandle'
import { STORAGE_KEYS } from '../../config/storageKeys'
import ChatHeader from './ChatHeader'
import ChatSource from './ChatSource'
import ChatStrip from './ChatStrip'
import FloatingBar from './FloatingBar'
import FloatingPanel from './FloatingPanel'
import ScaledChat from './ScaledChat'
import { loadRatio, nextRatio } from './chatLayout'
import { FILL_ATTRIBUTE, fillScopeFor } from './fillMode'
import { useFloatingVideo } from './floatingVideoContext'
import { useChatPlacement } from './useChatPlacement'
import { useChatPopout } from './useChatPopout'
import { useChatScale } from './useChatScale'
import { useDockDrag } from './useDockDrag'
import { useFillMode } from './useFillMode'
import { useFullscreen } from './useFullscreen'

// Literal class strings, because Tailwind cannot see classes built from pieces.
// The md-only variants are the fill layout when chat is docked: below the md
// breakpoint the stacked layout stays. The unprefixed ones apply at every width, for chat that
// is hidden or popped out, where there is no side-by-side layout to conflict.
const ROW_NORMAL = 'w-full max-w-[1600px] mx-auto min-h-[360px]'
const ROW_FILL_MD = 'md:fixed md:inset-0 md:z-50 md:max-w-none md:mx-0 md:min-h-0 md:bg-[var(--bg)]'
const ROW_FILL_ALL = 'w-full fixed inset-0 z-50 bg-[var(--bg)]'
const PLAYER_NORMAL =
  'w-full md:flex-none relative overflow-hidden rounded-lg border border-[color:var(--border)] aspect-video'
const PLAYER_FILL_MD = 'md:aspect-auto md:rounded-none md:border-0'
const PLAYER_FILL_ALL = 'w-full md:flex-none relative overflow-hidden aspect-auto'
// While the video floats and the chat is docked, the player wrapper stays in the row as an
// empty, invisible box that still gives the row its height, and the chat is laid over the
// whole row. Below md the stacked layout has no side-by-side to keep, so the box goes away.
const PLAYER_FLOATING = 'max-md:hidden md:invisible'
const CHAT_FLOATING = 'md:absolute md:inset-0'
// Positions the row for the absolutely placed chat, when fill mode has not already.
const ROW_FLOATING = 'relative'

interface ChatDockProps {
  channel: string | undefined
  /** The player, rendered inside the wrapper this dock sizes. */
  player: ReactNode
}

/**
 * Lays the player and chat out in a row and lets the viewer hide the chat or
 * dock it on either side. Nothing here is drawn over the player: the chat, the
 * resize handle and the restore tab are all siblings beside its wrapper.
 *
 * While the video floats in its own window the player is not rendered at all,
 * and the chat takes over the row. The chat keeps its place in the tree through
 * that change, so its iframe is never reloaded.
 */
export default function ChatDock({ channel, player }: ChatDockProps) {
  const { placement, hide, show, setSide, swapSide } = useChatPlacement()
  const { side, hidden } = placement
  const { handleProps: dragHandleProps } = useDockDrag(setSide)
  const popout = useChatPopout(channel)
  const chatScale = useChatScale()
  // What the viewer sees: popped out, else hidden, else docked on `side`.
  const chatVisible = !hidden && !popout.isOpen

  const video = useFloatingVideo()
  const floating = video.isFloating
  const floatingWithChat = floating && chatVisible
  const videoControl =
    floating || video.canOpen
      ? { floating, onClick: floating ? video.close : video.open }
      : null

  // Fill mode: the remembered setting, or fullscreen of this row (which is never
  // saved). The root attribute exists only while this dock is mounted, which is
  // only on the Twitch player page, so no other page is ever affected.
  const containerRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(containerRef)
  const { fill, setFill, toggleFill } = useFillMode()
  const scope = fillScopeFor({
    fill,
    fullscreen: fullscreen.isFullscreen,
    chatDocked: chatVisible,
  })
  useLayoutEffect(() => {
    if (!scope) return
    const root = document.documentElement
    root.setAttribute(FILL_ATTRIBUTE, scope)
    return () => root.removeAttribute(FILL_ATTRIBUTE)
  }, [scope])

  // Esc leaves fill mode. Best effort only: when focus is inside the chat iframe the
  // page never sees the key, which is why every state also has a visible button. The
  // browser uses Esc to leave fullscreen, so it is left alone while fullscreen.
  useEffect(() => {
    if (!fill) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.fullscreenElement) return
      setFill(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fill, setFill])

  const [playerRatio, setPlayerRatio] = useState(loadRatio)

  const handleResize = useCallback(
    (deltaX: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 0
      setPlayerRatio((prev) => nextRatio(prev, deltaX, containerWidth, side))
    },
    [side],
  )

  const handleResizeEnd = useCallback(() => {
    setPlayerRatio((current) => {
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_PANEL_RATIO, current.toFixed(3))
      } catch {
        // storage full or unavailable — the split still holds for this session
      }
      return current
    })
  }, [])

  const playerPercent = `${(playerRatio * 100).toFixed(1)}%`
  const chatPercent = `${((1 - playerRatio) * 100).toFixed(1)}%`

  const direction = side === 'left' ? 'md:flex-row-reverse' : 'md:flex-row'
  const baseRowClass =
    scope === 'all' ? ROW_FILL_ALL : scope === 'md' ? `${ROW_NORMAL} ${ROW_FILL_MD}` : ROW_NORMAL
  // A fill row is already positioned (fixed); only an ordinary row needs `relative`.
  const rowClass =
    floatingWithChat && scope === null ? `${baseRowClass} ${ROW_FLOATING}` : baseRowClass
  const basePlayerClass =
    scope === 'all'
      ? PLAYER_FILL_ALL
      : scope === 'md'
        ? `${PLAYER_NORMAL} ${PLAYER_FILL_MD}`
        : PLAYER_NORMAL
  const playerClass = floatingWithChat ? `${basePlayerClass} ${PLAYER_FLOATING}` : basePlayerClass

  return (
    <>
      {/* Above the row, never over the player. One place for every entry point, because
          the strip is too narrow to hold text. */}
      {(video.blocked || video.failed) && (
        <p role="status" className="px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {video.failed
            ? "The video couldn't start in the floating window, so it was closed. Click the button to try again."
            : "Couldn't open the floating window. Click the button again."}
        </p>
      )}
      <div
        ref={containerRef}
        data-testid="chat-dock"
        className={`flex flex-col ${direction} ${rowClass}`}
      >
        {/* Player */}
        <div
          data-testid="chat-player"
          className={playerClass}
          style={{
            flex: chatVisible ? `0 0 ${playerPercent}` : '1 1 0%',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          {floating ? (
            chatVisible ? null : (
              <FloatingPanel onBringBack={video.close} />
            )
          ) : (
            player
          )}
        </div>

        {!chatVisible ? (
          <ChatStrip
            side={side}
            restoreLabel={popout.isOpen ? 'Return chat to the page' : 'Show chat'}
            onRestore={popout.isOpen ? popout.close : show}
            fill={fill}
            onToggleFill={toggleFill}
            fullscreenSupported={fullscreen.supported}
            isFullscreen={fullscreen.isFullscreen}
            onToggleFullscreen={fullscreen.toggle}
            videoControl={videoControl}
          />
        ) : (
          <>
            {/* Resize handle — hidden on mobile. Its slot becomes `false` while floating, not
                a shorter child list, so the chat after it keeps its place and is not reloaded. */}
            {!floating && (
              <div className="hidden md:flex">
                <ResizableHandle onResize={handleResize} onResizeEnd={handleResizeEnd} />
              </div>
            )}

            {/* Chat */}
            <div
              data-testid="chat-panel"
              className={`w-full md:flex-none rounded-lg overflow-hidden flex flex-col${
                floating ? ` ${CHAT_FLOATING}` : ''
              }`}
              style={{
                // Shrinkable: player% + the 8px handle + chat% is 8px over the row,
                // which a full-window row would clip off-screen.
                flex: `0 1 ${chatPercent}`,
                minHeight: '300px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              {videoControl && (
                <FloatingBar floating={floating} onClick={videoControl.onClick} />
              )}
              <ChatHeader
                side={side}
                onHide={hide}
                onSwapSide={swapSide}
                onPopOut={popout.open}
                fill={fill}
                onToggleFill={toggleFill}
                fullscreenSupported={fullscreen.supported}
                isFullscreen={fullscreen.isFullscreen}
                onToggleFullscreen={fullscreen.toggle}
                textSize={{
                  scale: chatScale.scale,
                  canSmaller: chatScale.canSmaller,
                  canLarger: chatScale.canLarger,
                  onSmaller: chatScale.smaller,
                  onLarger: chatScale.larger,
                  onReset: chatScale.reset,
                }}
                dragHandleProps={floating ? {} : dragHandleProps}
                videoControl={videoControl}
                dockControls={!floating}
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
              <div className="flex-1 min-h-0">
                {channel ? (
                  <ScaledChat scale={chatScale.scale}>
                    <ChatSource channel={channel} />
                  </ScaledChat>
                ) : (
                  <div
                    className="flex items-center justify-center w-full h-full"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className="text-sm">No channel</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
