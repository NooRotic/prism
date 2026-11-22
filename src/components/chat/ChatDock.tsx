import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ResizableHandle } from '../layout/ResizableHandle'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useYoutubeChatPopout } from './useYoutubeChatPopout'
import ChatHeader from './ChatHeader'
import ChatSource from './ChatSource'
import ChatStrip from './ChatStrip'
import FloatingBar from './FloatingBar'
import FloatingPanel from './FloatingPanel'
import LandscapeChatHandle from './LandscapeChatHandle'
import ScaledChat from './ScaledChat'
import {
  floatingHeightCss,
  loadFloatingHeight,
  loadRatio,
  loadRowHeight,
  nextRatio,
  storeFloatingHeight,
  storeRowHeight,
} from './chatLayout'
import { useHeightDrag } from './useHeightDrag'
import { fillScopeFor } from './fillMode'
import { useFloatingVideo } from './floatingVideoContext'
import { useChatPlacement } from './useChatPlacement'
import { useChatPopout } from './useChatPopout'
import type { ChatKind } from '../../lib/chatPopout'
import { useChatScale } from './useChatScale'
import { useDockDrag } from './useDockDrag'
import { useFillMode } from './useFillMode'
import { useFullscreen } from './useFullscreen'
import { useLandscapePhone } from './useLandscapePhone'
import { useFillScope } from './useFillScope'
import {
  LANDSCAPE_CHAT_BASE,
  LANDSCAPE_CHAT_CLOSED,
  LANDSCAPE_CHAT_OPEN,
  landscapeHandleLabel,
} from './landscapeChat'

// Literal class strings, because Tailwind cannot see classes built from pieces.
// The md-only variants are the fill layout when chat is docked: below the md
// breakpoint the stacked layout stays. The unprefixed ones apply at every width, for chat that
// is hidden or popped out, where there is no side-by-side layout to conflict.
const ROW_NORMAL = 'w-full max-w-[1600px] mx-auto min-h-[360px]'
const ROW_FILL_MD = 'md:fixed md:inset-0 md:z-50 md:max-w-none md:mx-0 md:min-h-0 md:bg-[var(--bg)]'
const ROW_FILL_ALL = 'w-full fixed inset-0 z-50 bg-[var(--bg)]'
const PLAYER_NORMAL =
  'w-full md:flex-none relative overflow-hidden rounded-lg border border-[color:var(--border)] aspect-video min-h-[300px] max-md:pointer-coarse:min-h-0'
// min-h-[300px] above: the Twitch embed will not go below 300px tall, so a shorter 16:9 box (170px
// on a desktop window narrowed to a phone's width) crops the video and its controls. On a touch
// phone upright (coarse pointer, below md) the floor is lifted: Twitch's size rule is for desktop
// browsers, and a true 16:9 box has no black bars. Fill mode sizes the box to the window.
const PLAYER_FILL_MD = 'md:aspect-auto md:rounded-none md:border-0 md:min-h-0'
const PLAYER_FILL_ALL = 'w-full md:flex-none relative overflow-hidden aspect-auto'
// While the video floats and the chat is docked, the player wrapper stays in the row as an
// empty, invisible box that still gives the row its height, and the chat is laid over the
// whole row. Below md the stacked layout has no side-by-side to keep, so the box goes away.
const PLAYER_FLOATING = 'max-md:hidden md:invisible'
const CHAT_FLOATING = 'md:absolute md:inset-0'
// Positions the row for the absolutely placed chat, when fill mode has not already.
const ROW_FLOATING = 'relative'
// While the video floats the viewer can drag the chat taller. The chat fills the row, so a
// taller row is a taller chat: the dragged height is the row's minimum, from md up. It is a
// class of its own so that taking it off leaves the row at its ordinary `min-h-[360px]`.
const ROW_TALLER = 'md:min-h-(--chat-floating-height)'
const FLOATING_HEIGHT_VAR = '--chat-floating-height'

interface ChatDockProps {
  channel: string | undefined
  /** The player, rendered inside the wrapper this dock sizes. */
  player: ReactNode
  /** Whose chat this is: a Twitch login (default), or for YouTube the encoded target (see youtubeChatTarget). */
  kind?: ChatKind
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
export default function ChatDock({ channel, player, kind = 'twitch' }: ChatDockProps) {
  const { placement, hide, show, setSide, swapSide } = useChatPlacement()
  const { side, hidden } = placement
  const { handleProps: dragHandleProps } = useDockDrag(setSide)
  const popout = useChatPopout(channel, undefined, kind)
  // The linked streamer's YouTube chat button belongs to a Twitch chat only.
  const youtubeChat = useYoutubeChatPopout(kind === 'twitch' ? channel : undefined)
  const chatScale = useChatScale()
  // What the viewer sees: popped out, else hidden, else docked on `side`.
  const chatVisible = !hidden && !popout.isOpen

  const video = useFloatingVideo()
  const floating = video.isFloating

  // A phone held sideways: full-screen video, chat on demand. Its own runtime state, never
  // saved, and independent of the saved placement (`hidden`, `side` stay the desktop's).
  // While the video floats in its own window there is no video to make room around, so the
  // ordinary layout applies.
  const landscape = useLandscapePhone()
  const landscapeLayout = landscape && !floating
  const [landscapeChatOpen, setLandscapeChatOpen] = useState(false)
  const landscapeOpen = landscapeChatOpen && !popout.isOpen
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
  // Landscape phone mode is fill mode at every width, whatever the saved setting says.
  const scope = landscapeLayout
    ? 'all'
    : fillScopeFor({
        fill,
        fullscreen: fullscreen.isFullscreen,
        chatDocked: chatVisible,
      })
  useFillScope(scope)

  // Esc leaves fill mode. Best effort only: when focus is inside the chat iframe the
  // page never sees the key, which is why every state also has a visible button. The
  // browser uses Esc to leave fullscreen, so it is left alone while fullscreen.
  // Not in landscape phone mode: fill is forced there whatever is saved, so Esc would change
  // nothing visible and silently turn off the setting the viewer chose for the desktop.
  useEffect(() => {
    if (!fill || landscapeLayout) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.fullscreenElement) return
      setFill(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fill, landscapeLayout, setFill])

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

  // Two dragged heights, one for each case, remembered apart:
  //  - the video floats: the chat is laid over the row in place and the bar sits along the chat's bottom edge;
  //  - both on the page: one bar under the whole row, and the video and the chat grow together.
  // Neither bar is offered in fill mode or fullscreen, where the dock already fills the window.
  const floatingInPlace = floatingWithChat && scope === null
  const rowResizable = !floating && chatVisible && scope === null && !landscapeLayout
  const floatDrag = useHeightDrag(containerRef, ROW_TALLER, loadFloatingHeight, storeFloatingHeight)
  const rowDrag = useHeightDrag(containerRef, ROW_TALLER, loadRowHeight, storeRowHeight)
  const draggedHeight = floatingInPlace ? floatDrag.height : rowResizable ? rowDrag.height : 0

  const playerPercent = `${(playerRatio * 100).toFixed(1)}%`
  const chatPercent = `${((1 - playerRatio) * 100).toFixed(1)}%`

  const direction = landscapeLayout
    ? side === 'left'
      ? 'flex-row-reverse'
      : 'flex-row'
    : side === 'left'
      ? 'md:flex-row-reverse'
      : 'md:flex-row'
  // The ordinary row stacks below md; the landscape row never does.
  const rowFlex = landscapeLayout ? 'flex' : 'flex flex-col'
  const baseRowClass =
    scope === 'all' ? ROW_FILL_ALL : scope === 'md' ? `${ROW_NORMAL} ${ROW_FILL_MD}` : ROW_NORMAL
  // A fill row is already positioned (fixed); only an ordinary row needs `relative`.
  const taller = draggedHeight > 0
  const rowClass = `${baseRowClass}${floatingInPlace ? ` ${ROW_FLOATING}` : ''}${taller ? ` ${ROW_TALLER}` : ''}`
  const rowStyle = taller
    ? ({ [FLOATING_HEIGHT_VAR]: floatingHeightCss(draggedHeight) } as CSSProperties)
    : undefined
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
        className={`${rowFlex} ${direction} ${rowClass}`}
        style={rowStyle}
      >
        {/* Player */}
        <div
          data-testid="chat-player"
          className={playerClass}
          style={{
            flex: chatVisible && !landscapeLayout ? `0 0 ${playerPercent}` : '1 1 0%',
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

        {landscapeLayout ? (
          <>
            {/* Beside the video, never over it: Twitch pauses an embed that anything covers. */}
            <LandscapeChatHandle
              side={side}
              open={landscapeOpen}
              label={landscapeHandleLabel(landscapeOpen, popout.isOpen)}
              onToggle={popout.isOpen ? popout.close : () => setLandscapeChatOpen((open) => !open)}
            />
            <div
              data-testid="chat-panel"
              aria-hidden={!landscapeOpen}
              className={`${LANDSCAPE_CHAT_BASE} ${landscapeOpen ? LANDSCAPE_CHAT_OPEN : LANDSCAPE_CHAT_CLOSED}`}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: landscapeOpen ? '1px solid var(--border)' : 'none',
              }}
            >
              <ChatHeader
                side={side}
                onHide={() => setLandscapeChatOpen(false)}
                onSwapSide={swapSide}
                onPopOut={popout.open}
                youtubeChat={youtubeChat.available ? { onClick: youtubeChat.open } : null}
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
                dragHandleProps={{}}
                dockControls={false}
                fillControls={false}
              />
              <div className="flex-1 min-h-0">
                {channel ? (
                  <ScaledChat scale={chatScale.scale}>
                    <ChatSource channel={channel} kind={kind} />
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
        ) : !chatVisible ? (
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
              // Stacked below md the panel has no fixed height, so its minimum is what the chat gets:
              // a tall one (60dvh) so the chat is usable, not a 300px strip.
              className={`w-full md:flex-none min-h-[300px] max-md:min-h-[60dvh] rounded-lg overflow-hidden flex flex-col${
                floating ? ` ${CHAT_FLOATING}` : ''
              }`}
              style={{
                // Shrinkable: player% + the 8px handle + chat% is 8px over the row,
                // which a full-window row would clip off-screen.
                flex: `0 1 ${chatPercent}`,
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
                youtubeChat={youtubeChat.available ? { onClick: youtubeChat.open } : null}
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
              {/* The chat fills an absolutely placed box: a percentage height on the iframe would
                  resolve to auto here (the panel has no fixed height) and shrink it to 150px. */}
              <div className="relative flex-1 min-h-0">
                <div className="absolute inset-0">
                  {channel ? (
                    <ScaledChat scale={chatScale.scale}>
                      <ChatSource channel={channel} kind={kind} />
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
              {/* Along the bottom edge, under the chat: drag down for a taller chat. Its slot is
                  `false` otherwise, so the chat above keeps its place and is not reloaded. */}
              {floatingInPlace && (
                <div className="hidden md:flex shrink-0">
                  <ResizableHandle
                    direction="vertical"
                    label="Resize chat height"
                    onResize={floatDrag.onResize}
                    onResizeEnd={floatDrag.onResizeEnd}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* Under the whole row, video and chat: drag down and both grow with it. It never covers the player. */}
      {rowResizable && (
        <div className="hidden md:flex w-full max-w-[1600px] mx-auto">
          <ResizableHandle
            direction="vertical"
            thickness={14}
            label="Resize video and chat height"
            onResize={rowDrag.onResize}
            onResizeEnd={rowDrag.onResizeEnd}
          />
        </div>
      )}
    </>
  )
}
