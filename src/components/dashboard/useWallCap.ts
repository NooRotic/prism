import { useEffect, useState } from 'react'

/** From this window width up the dashboard has room for two columns and a bigger wall. */
const WIDE_WIDTH = 1024
export const WALL_CAP_WIDE = 8
export const WALL_CAP_NARROW = 6

function readCap(): number {
  return window.innerWidth >= WIDE_WIDTH ? WALL_CAP_WIDE : WALL_CAP_NARROW
}

/**
 * How many live tiles the wall shows before its "+ N more live" button.
 * Reads the window width rather than `matchMedia`, which the test setup fixes.
 */
export function useWallCap(): number {
  const [cap, setCap] = useState(readCap)

  useEffect(() => {
    const onResize = () => setCap(readCap())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return cap
}
