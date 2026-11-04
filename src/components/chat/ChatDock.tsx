import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ResizableHandle } from '../layout/ResizableHandle'
import { STORAGE_KEYS } from '../../config/storageKeys'
import ChatHeader from './ChatHeader'
import ChatSource from './ChatSource'
import ChatTab from './ChatTab'
import { loadRatio, nextRatio } from './chatLayout'
import { FILL_ATTRIBUTE, fillScopeFor } from './fillMode'
import { useChatPlacement } from './useChatPlacement'
import { useChatPopout } from './useChatPopout'
import { useDockDrag } from './useDockDrag'
import { useFillMode } from './useFillMode'
import { useFullscreen } from './useFullscreen'

// Literal class strings, because Tailwind cannot see classes built from pieces.
// The md-only variants are the fill layout when chat is docked: below 768px the
// stacked layout stays. The unprefixed ones apply at every width, for chat that
// is hidden or popped out, where there is no side-by-side layout to conflict.
const ROW_NORMAL = 'w-full max-w-[1600px] mx-auto min-h-[360px]'
const ROW_FILL_MD = 'md:fixed md:inset-0 md:z-50 md:max-w-none md:mx-0 md:min-h-0 md:bg-[var(--bg)]'
const ROW_FILL_ALL = 'w-full fixed inset-0 z-50 bg-[var(--bg)]'
const PLAYER_NORMAL =
  'w-full md:flex-none relative overflow-hidden rounded-lg border border-[color:var(--border)] aspect-video'
const PLAYER_FILL_MD = 'md:aspect-auto md:rounded-none md:border-0'
const PLAYER_FILL_ALL = 'w-full md:flex-none relative overflow-hidden aspect-auto'

interface ChatDockProps {
  channel: string | undefined
  /** The player, rendered inside the wrapper this dock sizes. */
  player: ReactNode
}

/**
 * Lays the player and chat out in a row and lets the viewer hide the chat or
 * dock it on either side. Nothing here is drawn over the player: the chat, the
 * resize handle and the restore tab are all siblings beside its wrapper.
 */
export default function ChatDock({ channel, player }: ChatDockProps) {
  const { placement, hide, show, setSide, swapSide } = useChatPlacement()
  const { side, hidden } = placement
  const { handleProps: dragHandleProps } = useDockDrag(setSide)
  const popout = useChatPopout(channel)
  // What the viewer sees: popped out, else hidden, else docked on `side`.
  const chatVisible = !hidden && !popout.isOpen

  // Fill mode: the remembered setting, or fullscreen of this row (which is never
  // saved). The root attribute exists only while this dock is mounted, which is
  // only on the Twitch player page, so no other page is ever affected.
  const containerRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(containerRef)
  const { fill } = useFillMode()
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
  const rowClass =
    scope === 'all' ? ROW_FILL_ALL : scope === 'md' ? `${ROW_NORMAL} ${ROW_FILL_MD}` : ROW_NORMAL
  const playerClass =
    scope === 'all'
      ? PLAYER_FILL_ALL
      : scope === 'md'
        ? `${PLAYER_NORMAL} ${PLAYER_FILL_MD}`
        : PLAYER_NORMAL

  return (
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
        {player}
      </div>

      {popout.isOpen ? (
        <ChatTab side={side} label="Return chat to the page" onClick={popout.close} />
      ) : hidden ? (
        <ChatTab side={side} label="Show chat" onClick={show} />
      ) : (
        <>
          {/* Resize handle — hidden on mobile */}
          <div className="hidden md:flex">
            <ResizableHandle onResize={handleResize} onResizeEnd={handleResizeEnd} />
          </div>

          {/* Chat */}
          <div
            data-testid="chat-panel"
            className="w-full md:flex-none rounded-lg overflow-hidden flex flex-col"
            style={{
              // Shrinkable: player% + the 8px handle + chat% is 8px over the row,
              // which a full-window row would clip off-screen.
              flex: `0 1 ${chatPercent}`,
              minHeight: '300px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}
          >
            <ChatHeader
              side={side}
              onHide={hide}
              onSwapSide={swapSide}
              onPopOut={popout.open}
              dragHandleProps={dragHandleProps}
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
                <ChatSource channel={channel} />
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
  )
}
