/**
 * What PRISM tells the owner's Matomo (see the block in index.html). The block creates `window._paq` only where a visit may
 * be counted: not on localhost or another host, and not for a visitor who sends Do Not Track or Global Privacy Control.
 * Everywhere else every call here does nothing. Counting is best effort: nothing here throws, and nothing waits for it.
 *
 * Never hand these a pasted address, typed words or an account name: what is passed is sent as it is.
 */

import { analyticsPage } from './analyticsPage'

declare global {
  interface Window {
    /** An array until matomo.js loads and puts its own object there, so only `push` can be relied on. */
    _paq?: { push(entry: unknown[]): unknown }
  }
}

export type EventCategory = 'HLS / DASH' | 'Twitch' | 'YouTube' | 'Linking' | 'Feature' | 'Stayed'

/** The name given to a stream that is not in the list: its address is never sent. */
export const PASTED_STREAM = 'Pasted address'

function push(...entry: unknown[]): void {
  try {
    window._paq?.push(entry)
  } catch {
    // counting must never break a page
  }
}

export interface PageView {
  path: string
  title: string
  /** Campaign tags only (see `campaignQuery`). */
  query?: string
  /** What sent the visitor here. Left out, Matomo uses the browser's own; empty, none is sent. */
  referrer?: string
}

/** Counts a page view under the given address, never the browser's own (which can hold a pasted stream). */
export function trackPage({ path, title, query = '', referrer }: PageView): void {
  if (referrer !== undefined) push('setReferrerUrl', referrer)
  push('setCustomUrl', `${window.location.origin}${path}${query}`)
  push('setDocumentTitle', title)
  push('trackPageView')
}

/** Where a click on a link leads, when that is another site: the site alone (`https://www.twitch.tv/`). Null for anything else. */
function otherSite(target: EventTarget | null): string | null {
  const link = target instanceof Element ? target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || link.closest('.matomo_ignore')) return null
  try {
    const { protocol, origin } = new URL(link.href)
    if ((protocol !== 'http:' && protocol !== 'https:') || origin === window.location.origin) return null
    return `${origin}/`
  } catch {
    return null
  }
}

/**
 * Counts clicks on links to other sites, by site and never by address. Matomo's own link tracking is left off on purpose: it
 * sends every address whole unless the link is marked, and PRISM builds links from what people type and paste (a category
 * search, a video address with no id). A link whose site alone is somebody's own, like a pasted stream's, carries
 * `matomo_ignore`. Nothing is counted on a page that is not (admin, pop-outs). Returns the way to stop.
 */
export function startLinkTracking(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.type === 'auxclick' && event.button !== 1) return // a right click opens nothing
    const site = otherSite(event.target)
    if (site === null || analyticsPage(window.location.pathname) === null) return
    push('trackLink', site, 'link')
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('auxclick', onClick, true)
  return () => {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('auxclick', onClick, true)
  }
}

export function trackEvent(category: EventCategory, action: string, name?: string): void {
  if (name === undefined) push('trackEvent', category, action)
  else push('trackEvent', category, action, name)
}

/** How a link between a creator's accounts is named in the reports. */
export function linkName(link: { twitch: string; youtube?: { title: string }; kick?: { slug: string } }): string {
  const others = [link.youtube && `youtube/${link.youtube.title}`, link.kick && `kick/${link.kick.slug}`].filter(Boolean)
  return `twitch/${link.twitch} <-> ${others.join(' + ')}`
}
