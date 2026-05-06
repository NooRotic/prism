/**
 * Centralized storage key registry. Add new keys here rather than
 * hardcoding strings in consumers — prevents typos and key drift.
 *
 * - `LOCAL_*` keys live in localStorage (persistent across sessions)
 * - `SESSION_*` keys live in sessionStorage (cleared on tab close)
 * - `*_PREFIX` constants are namespace prefixes for dynamic keys
 */
export const STORAGE_KEYS = {
  /** Twitch OAuth access token. Twitch-scoped, not prism-branded. */
  LOCAL_TWITCH_ACCESS_TOKEN: 'twitch_access_token',
  /** OAuth state nonce for CSRF protection during the implicit grant flow. */
  SESSION_TWITCH_OAUTH_STATE: 'twitch_oauth_state',
  /** Onboarding modal acknowledged once. */
  LOCAL_ONBOARDING_SEEN: 'prism_onboarding_seen',
  /** Flag indicating the glaze_*→prism_* migration has run. */
  LOCAL_MIGRATED: 'prism_migrated',
  /** Following panel sort mode + direction (e.g. "live-first:desc"). */
  LOCAL_FOLLOWING_SORT: 'prism_following_sort',
  /** SmartUrlInput search history (JSON array). */
  LOCAL_SEARCH_HISTORY: 'prism_search_history',
  /** Player/chat panel split ratio (0.5..0.92). */
  LOCAL_PANEL_RATIO: 'prism_panel_ratio',
  /** First-mount intro animation dismissed-once IDs (JSON array). */
  LOCAL_INTROS_SEEN: 'prism_intros_seen',
  /** Prefix for per-category YouTube cache entries (e.g. prism_yt_cache_popular). */
  LOCAL_YOUTUBE_CACHE_PREFIX: 'prism_yt_cache_',
} as const
