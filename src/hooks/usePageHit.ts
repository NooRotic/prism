import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { SEND_VISITS } from '../config/historyServer'
import { normalisePath, sectionForPath, sendHit } from '../lib/usageApi'

/**
 * Counts page opens for the owner's usage numbers. One page open is one navigation that lands on a different
 * path (moving from one channel to another counts; a changed query or hash, a trailing slash or a re-render
 * does not; a full reload counts once as it loads). The admin pages are never counted. Production builds only,
 * like the visit ping, so working on PRISM locally adds nothing to the real counts.
 */
export function usePageHit(): void {
  const { pathname } = useLocation()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!SEND_VISITS) return
    const path = normalisePath(pathname)
    if (lastPath.current === path) return
    lastPath.current = path

    const section = sectionForPath(path)
    if (section !== null) sendHit(section)
  }, [pathname])
}
