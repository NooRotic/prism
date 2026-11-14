import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'
import type { UsageSection } from './usageSections'

export { USAGE_SECTIONS, type UsageSection } from './usageSections'

/** A path without its trailing slash (the root stays `/`), so `/twitch` and `/twitch/` are one page. */
export function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Which part of PRISM a page belongs to, for the owner's usage counts. The patterns are the route table's
 * (`/twitch/:channel` is one segment), so a mistyped address is `other`, as the not-found page is. The admin
 * pages are the owner's tool and are not counted at all (null).
 */
export function sectionForPath(pathname: string): UsageSection | null {
  const path = normalisePath(pathname)
  if (path === '/admin' || path.startsWith('/admin/')) return null
  if (path === '/') return 'home'
  if (/^\/twitch(\/[^/]+)?$/.test(path)) return 'twitch'
  if (/^\/youtube(\/[^/]+)?$/.test(path)) return 'youtube'
  if (/^\/hls-dash(\/[^/]+)?$/.test(path)) return 'hls-dash'
  if (/^\/chat\/[^/]+$/.test(path)) return 'chat-popout'
  return 'other'
}

/**
 * Tells the history server a page was opened in this section. The body is a JSON string sent as plain text with
 * no custom headers, so the browser sends no preflight. Nothing about the visitor is sent; the page never waits
 * for the answer and ignores every failure.
 */
export function sendHit(section: UsageSection): void {
  if (!HISTORY_ENABLED) return
  try {
    void fetch(`${HISTORY_API_URL}/api/hit`, {
      method: 'POST',
      body: JSON.stringify({ section }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {})
  } catch {
    // no fetch, or it threw before returning a promise: counting is best effort
  }
}
