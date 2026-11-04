import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ResizableHandle } from '../layout/ResizableHandle'
import { STORAGE_KEYS } from '../../config/storageKeys'
import ChatHeader from './ChatHeader'
import ChatSource from './ChatSource'
import ChatTab from './ChatTab'
import { loadRatio, nextRatio } from './chatLayout'
import { useChatPlacement } from './useChatPlacement'
import { useDockDrag } from './useDockDrag'

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

  const [playerRatio, setPlayerRatio] = useState(loadRatio)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleResize = useCallback(
    (deltaX: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 0
      setPlayerRatio((prev) => nextRatio(prev, deltaX, containerWidth, side))
    },
    [side],
  )

  const handleResizeEnd = useCallback(() => {
    setPlayerRatio((current) => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_PANEL_RATIO, current.toFixed(3))
      return current
    })
  }, [])

  const playerPercent = `${(playerRatio * 100).toFixed(1)}%`
  const chatPercent = `${((1 - playerRatio) * 100).toFixed(1)}%`

  return (
    <div
      ref={containerRef}
      data-testid="chat-dock"
      className={`flex flex-col ${
        side === 'left' ? 'md:flex-row-reverse' : 'md:flex-row'
      } w-full max-w-[1600px] mx-auto`}
      style={{ minHeight: '360px' }}
    >
      {/* Player */}
      <div
        data-testid="chat-player"
        className="w-full md:flex-none relative overflow-hidden rounded-lg"
        style={{
          width: undefined,
          flex: hidden ? '1 1 0%' : `0 0 ${playerPercent}`,
          aspectRatio: '16 / 9',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {player}
      </div>

      {hidden ? (
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
              flex: `0 0 ${chatPercent}`,
              minHeight: '300px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}
          >
            <ChatHeader
              side={side}
              onHide={hide}
              onSwapSide={swapSide}
              dragHandleProps={dragHandleProps}
            />
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
