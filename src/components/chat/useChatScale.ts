import { useCallback, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import {
  CHAT_SCALE_STEPS,
  DEFAULT_CHAT_SCALE,
  parseChatScale,
  stepScale,
} from './chatScale'

function readStored(): number {
  try {
    return parseChatScale(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_SCALE))
  } catch {
    return DEFAULT_CHAT_SCALE
  }
}

function persist(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_SCALE, String(scale))
  } catch {
    // storage full or unavailable — the change still applies for this session
  }
}

interface UseChatScaleReturn {
  scale: number
  larger: () => void
  smaller: () => void
  reset: () => void
  canLarger: boolean
  canSmaller: boolean
}

/**
 * The saved chat text size. One owner per window passes it down. A change made
 * in another window arrives as a `storage` event (the browser never sends one to
 * the window that wrote it), so the main window and the pop-out keep one size.
 */
export function useChatScale(): UseChatScaleReturn {
  const [scale, setScale] = useState<number>(readStored)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // A null key means storage was cleared in the other window.
      if (event.key !== null && event.key !== STORAGE_KEYS.LOCAL_CHAT_SCALE) return
      setScale(parseChatScale(event.key === null ? null : event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const move = useCallback((direction: 1 | -1) => {
    setScale((prev) => {
      const next = stepScale(prev, direction)
      persist(next)
      return next
    })
  }, [])

  const larger = useCallback(() => move(1), [move])
  const smaller = useCallback(() => move(-1), [move])
  const reset = useCallback(() => {
    setScale(DEFAULT_CHAT_SCALE)
    persist(DEFAULT_CHAT_SCALE)
  }, [])

  return useMemo(
    () => ({
      scale,
      larger,
      smaller,
      reset,
      canLarger: scale < CHAT_SCALE_STEPS[CHAT_SCALE_STEPS.length - 1],
      canSmaller: scale > CHAT_SCALE_STEPS[0],
    }),
    [scale, larger, smaller, reset],
  )
}
