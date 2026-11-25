import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { STORAGE_KEYS } from '../config/storageKeys'
import { startLinkTracking, trackPage } from '../lib/analytics'
import { analyticsPage, campaignQuery } from '../lib/analyticsPage'
import { normalisePath } from '../lib/usageApi'

/** The other site public/404.html kept for us, if any. Read once and forgotten. */
function takeEntryReferrer(): string | null {
  try {
    const kept = sessionStorage.getItem(STORAGE_KEYS.SESSION_ENTRY_REFERRER)
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ENTRY_REFERRER)
    return kept
  } catch {
    return null // storage blocked: the visit just has no kept referrer
  }
}

/** True when the browser names PRISM itself as what sent the visitor here (a reload, or the 404 page's redirect). */
function cameFromPrism(): boolean {
  try {
    return document.referrer !== '' && new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * What the first page view gives as its referrer. Within one site a browser names the whole address, query included, so
 * PRISM's own can hold a pasted stream: it is sent as nothing. Undefined leaves another site's to Matomo.
 */
function entryReferrer(): string | undefined {
  const kept = takeEntryReferrer()
  if (kept) return kept
  return cameFromPrism() ? '' : undefined
}

/**
 * Counts page views in the owner's Matomo, with the same rule for a page change as `usePageHit` (a different path; a changed
 * query or fragment, a trailing slash or a re-render is none), so the two totals can be compared. What is sent is what
 * `analyticsPage` allows; a page it does not count (admin, pop-outs) sends nothing and does not use up the first view, which
 * alone carries the campaign tags and the referrer from outside.
 */
export function usePageView(): void {
  const { pathname, search } = useLocation()
  const lastPath = useRef<string | null>(null)
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    const path = normalisePath(pathname)
    if (lastPath.current === path) return
    lastPath.current = path

    const page = analyticsPage(path)
    if (page === null) return
    if (lastSent.current === null) {
      const referrer = entryReferrer()
      trackPage({ ...page, query: campaignQuery(search), ...(referrer === undefined ? {} : { referrer }) })
      startLinkTracking()
    } else {
      trackPage({ ...page, referrer: `${window.location.origin}${lastSent.current}` })
    }
    lastSent.current = page.path
    // The query is read for the first view only; a change of it alone is not a page change.
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
}
