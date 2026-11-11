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
  /** Channel rail edge: 'left' or 'right'. */
  LOCAL_RAIL_POSITION: 'prism_rail_position',
  /** Chat dock state: JSON `{ side: 'left' | 'right', hidden: boolean }`. */
  LOCAL_CHAT_PLACEMENT: 'prism_chat_placement',
  /** Height in px the viewer dragged the chat to while the video floats; absent means the default height. */
  LOCAL_CHAT_FLOAT_HEIGHT: 'prism_chat_float_height',
  /** Last size and position of the chat pop-out window (JSON). */
  LOCAL_CHAT_POPOUT_BOUNDS: 'prism_chat_popout_bounds',
  /** Fill mode (video and chat fill the window): the string 'true' when on. */
  LOCAL_FILL_MODE: 'prism_fill_mode',
  /** Chat text size: one of the CHAT_SCALE_STEPS values, e.g. '1.5'. Every window follows it. */
  LOCAL_CHAT_SCALE: 'prism_chat_scale',
  /** Last content size of the floating video window (JSON `{ width, height }`). Raised to 480x270 on load. */
  LOCAL_VIDEO_POPOUT_SIZE: 'prism_video_popout_size',
  /** Which view of the dashboard's live follows the viewer last used: 'wall' or 'list'. */
  LOCAL_DASHBOARD_WALL_VIEW: 'prism_dashboard_wall_view',
  /** Id of this browser tab, so a chat pop-out knows which tab owns it. Survives a reload. */
  SESSION_TAB_ID: 'prism_tab_id',
} as const
