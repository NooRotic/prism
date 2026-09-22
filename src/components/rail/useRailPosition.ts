import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import type { RailPosition } from './types'

const DEFAULT_POSITION: RailPosition = 'right'

/** Only these two have layouts. See the note on RailPosition. */
function isImplemented(value: string | null): value is 'left' | 'right' {
  return value === 'left' || value === 'right'
}

interface UseRailPositionReturn {
  position: RailPosition
  flip: () => void
}

/**
 * Owns the rail's edge preference and its persistence. The rail mounts once
 * globally, so local state is sufficient — nothing outside the rail reads
 * this, and putting it in AppContext would create a second owner for one
 * value.
 */
export function useRailPosition(): UseRailPositionReturn {
  const [position, setPositionState] = useState<RailPosition>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)
    return isImplemented(stored) ? stored : DEFAULT_POSITION
  })

  const flip = useCallback(() => {
    setPositionState((prev) => {
      const next: RailPosition = prev === 'left' ? 'right' : 'left'
      localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, next)
      return next
    })
  }, [])

  return { position, flip }
}
