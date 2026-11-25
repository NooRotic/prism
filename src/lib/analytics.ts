/**
 * What PRISM tells the owner's Matomo (see the block in index.html). The block creates `window._paq` only where a visit may
 * be counted: not on localhost or another host, and not for a visitor who sends Do Not Track or Global Privacy Control.
 * Everywhere else every call here does nothing. Counting is best effort: nothing here throws, and nothing waits for it.
 *
 * Never hand these a pasted address, typed words or an account name: what is passed is sent as it is.
 */

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

/** Counts clicks on links to other sites. Started with the first page view, so a page that sends no view sends no click either. */
export function startLinkTracking(): void {
  push('enableLinkTracking')
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
