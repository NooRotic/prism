import { useCallback, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { parseFill } from './fillMode'

function readStored(): boolean {
  try {
    return parseFill(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE))
  } catch {
    return false
  }
}

function persist(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, String(on))
  } catch {
    // storage full or unavailable — the change still applies for this session
  }
}

interface UseFillModeReturn {
  fill: boolean
  setFill: (on: boolean) => void
  toggleFill: () => void
}

/** Owns the remembered fill setting. Fullscreen is separate and never saved. */
export function useFillMode(): UseFillModeReturn {
  const [fill, setFillState] = useState<boolean>(readStored)

  const setFill = useCallback((on: boolean) => {
    setFillState(on)
    persist(on)
  }, [])

  const toggleFill = useCallback(() => {
    setFillState((prev) => {
      const next = !prev
      persist(next)
      return next
    })
  }, [])

  return useMemo(() => ({ fill, setFill, toggleFill }), [fill, setFill, toggleFill])
}
