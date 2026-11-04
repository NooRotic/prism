import { useState, useCallback, useMemo } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { DEFAULT_PLACEMENT, parsePlacement } from './chatPlacement'
import type { ChatPlacement, DockSide } from './chatPlacement'

function readStored(): ChatPlacement {
  try {
    return parsePlacement(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT))
  } catch {
    return { ...DEFAULT_PLACEMENT }
  }
}

function persist(placement: ChatPlacement): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, JSON.stringify(placement))
  } catch {
    // storage full or unavailable — the change still applies for this session
  }
}

interface UseChatPlacementReturn {
  placement: ChatPlacement
  hide: () => void
  show: () => void
  setSide: (side: DockSide) => void
  swapSide: () => void
}

/**
 * Owns where the chat is docked and whether it is hidden, and persists both.
 * Whether it is popped out into its own window is deliberately not here: that
 * is runtime state, so a closed browser can never leave it stuck on.
 */
export function useChatPlacement(): UseChatPlacementReturn {
  const [placement, setPlacement] = useState<ChatPlacement>(readStored)

  const update = useCallback((change: (prev: ChatPlacement) => ChatPlacement) => {
    setPlacement((prev) => {
      const next = change(prev)
      persist(next)
      return next
    })
  }, [])

  return useMemo(
    () => ({
      placement,
      hide: () => update((prev) => ({ ...prev, hidden: true })),
      show: () => update((prev) => ({ ...prev, hidden: false })),
      setSide: (side: DockSide) => update((prev) => ({ ...prev, side })),
      swapSide: () => update((prev) => ({ ...prev, side: prev.side === 'left' ? 'right' : 'left' })),
    }),
    [placement, update],
  )
}
