/**
 * The PRISM history server (server/ in this repository, running at prism-data.nooroticx.tv): daily
 * TwitchTracker snapshots for every channel people open, so a channel page can show numbers and a growing
 * history for any channel, not only the viewer's own.
 *
 * HISTORY_ENABLED is the kill switch: false makes no request and every page behaves as it did before the
 * server existed. The server is optional by design; when it is slow or down, nothing on a page changes.
 */
export const HISTORY_ENABLED = true

/** Where the server lives. Override with VITE_HISTORY_API_URL (for example a local test server). */
export const HISTORY_API_URL: string = (
  (import.meta.env.VITE_HISTORY_API_URL as string | undefined) || 'https://prism-data.nooroticx.tv'
).replace(/\/+$/, '')

/**
 * Whether this build tells the server which channel was opened (a "visit", which is what starts tracking a
 * channel). Production builds do; a development build only reads, so working on PRISM on localhost can never
 * add channels to the production database. Set VITE_HISTORY_SEND_VISITS=1 to test visits on purpose.
 */
export const SEND_VISITS: boolean = import.meta.env.PROD || import.meta.env.VITE_HISTORY_SEND_VISITS === '1'
