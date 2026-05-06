/**
 * Centralized storage key registry. Add new keys here rather than
 * hardcoding strings in consumers — prevents typos and key drift.
 *
 * - `LOCAL_*` keys live in localStorage (persistent across sessions)
 * - `SESSION_*` keys live in sessionStorage (cleared on tab close)
 */
export const STORAGE_KEYS = {
  /** Twitch OAuth access token. Twitch-scoped, not prism-branded. */
  LOCAL_TWITCH_ACCESS_TOKEN: 'twitch_access_token',
  /** OAuth state nonce for CSRF protection during the implicit grant flow. */
  SESSION_TWITCH_OAUTH_STATE: 'twitch_oauth_state',
} as const
