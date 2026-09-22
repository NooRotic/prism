import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import type { RailPosition } from './types'

// Left, not right: on the primary /twitch/:channel route chat also docks
// right (see TwitchPlayerPage's DEFAULT_RATIO split), and at a 1280px
// viewport the 260px expanded rail would fully cover it — more than the
// spec's accepted cost of "occludes a narrow edge of the video." The left
// edge is video, which is that trade. Users can still flip it.
const DEFAULT_POSITION: RailPosition = 'left'

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
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, next)
      } catch {
        // storage full or unavailable — silently ignore
      }
      return next
    })
  }, [])

  return { position, flip }
}
