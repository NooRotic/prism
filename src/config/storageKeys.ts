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
  /** Prefix for the YouTube player page's cached API answers (details, comments, playlists, topic searches, related). */
  LOCAL_VIDEO_PAGE_CACHE_PREFIX: 'prism_vp_',
  /** Twitch's recommended channels the owner sent from the PRISM helper extension (JSON `{ logins, importedAt }`). */
  LOCAL_TWITCH_RECOMMENDED: 'prism_twitch_recommended',
  /** Catch up: the owner's imported YouTube subscriptions (JSON array of `{ id, title }`). */
  LOCAL_CATCHUP_SUBSCRIPTIONS: 'prism_catchup_subscriptions',
  /** Catch up: which account the last subscription import came from (JSON `{ title, thumbnailUrl, importedAt }`). */
  LOCAL_CATCHUP_ACCOUNT: 'prism_catchup_account',
  /** Catch up: Watch Later video ids the owner pasted (JSON array of strings). */
  LOCAL_CATCHUP_WATCH_LATER: 'prism_catchup_watch_later',
  /** Catch up: video ids watched in PRISM, newest first, used as Mix seeds (JSON array, max 10). */
  LOCAL_CATCHUP_WATCHED: 'prism_catchup_watched',
  /** Catch up: the subscription lane, cached for 30 minutes (JSON `{ at, videos }`). */
  LOCAL_CATCHUP_LANE_CACHE: 'prism_catchup_lane_s',
  /** Catch up: the queue as shown (up to 200 `{ id, title, thumbnail }`), read by the player page's filmstrip. */
  LOCAL_CATCHUP_QUEUE: 'prism_catchup_queue',
  /** Rail "Check live": timestamps (ms) of the viewer's recent checks, for the cooldown and the daily limit (JSON array of numbers). */
  LOCAL_YOUTUBE_LIVE_CHECKS: 'prism_youtube_live_checks',
  /** Rail "Check live": the last answer (JSON `{ checkedAt, entries }`), kept so a reload does not cost another check. */
  LOCAL_YOUTUBE_LIVE_LAST: 'prism_youtube_live_last',
  /** The YouTube grid's recent searches (JSON array of strings, newest first). */
  LOCAL_YOUTUBE_SEARCH_HISTORY: 'prism_youtube_search_history',
  /** Twitch channels whose suggested same-name YouTube channel the viewer said "not them" to (JSON array of logins). */
  LOCAL_LINK_DISMISSED: 'prism_link_dismissed',
  /** "Also on YouTube / Kick": the viewer's linked creator accounts (JSON array of link records, newest first). */
  LOCAL_LINKED_ACCOUNTS: 'prism_linked_accounts',
  /** Height in px the viewer dragged the video-and-chat row to with both on the page; absent means the default height. */
  LOCAL_ROW_HEIGHT: 'prism_row_height',
  /** Channel rail edge: 'left' or 'right'. */
  LOCAL_RAIL_POSITION: 'prism_rail_position',
  /** Chat dock state: JSON `{ side: 'left' | 'right', hidden: boolean }`. */
  LOCAL_CHAT_PLACEMENT: 'prism_chat_placement',
  /** Height in px the viewer dragged the chat to while the video floats; absent means the default height. */
  LOCAL_CHAT_FLOAT_HEIGHT: 'prism_chat_float_height',
  /** Width in px the viewer dragged the chat column to on an offline channel's page (wide window). */
  LOCAL_CHAT_OFFLINE_WIDTH: 'prism_chat_offline_width',
  /** Last size and position of the chat pop-out window (JSON). */
  LOCAL_CHAT_POPOUT_BOUNDS: 'prism_chat_popout_bounds',
  LOCAL_YOUTUBE_CHAT_POPOUT_BOUNDS: 'prism_youtube_chat_popout_bounds',
  /** Fill mode (video and chat fill the window): the string 'true' when on. */
  LOCAL_FILL_MODE: 'prism_fill_mode',
  /** Chat text size: one of the CHAT_SCALE_STEPS values, e.g. '1.5'. Every window follows it. */
  LOCAL_CHAT_SCALE: 'prism_chat_scale',
  /** Last content size of the floating video window (JSON `{ width, height }`). Raised to 480x270 on load. */
  LOCAL_VIDEO_POPOUT_SIZE: 'prism_video_popout_size',
  /** Which view of the dashboard's live follows the viewer last used: 'wall' or 'list'. */
  LOCAL_DASHBOARD_WALL_VIEW: 'prism_dashboard_wall_view',
  /** The group filter chosen on the HLS / DASH page, by the group's NAME (its position changes with the list); absent means all streams. */
  LOCAL_HLS_GROUP: 'prism_hls_group',
  /** Prefix for cached TwitchTracker summaries, one per lower-cased login (e.g. prism_tt_cache_streamer). */
  LOCAL_TWITCHTRACKER_CACHE_PREFIX: 'prism_tt_cache_',
  /** Player volume the viewer last chose, 0..1 as a decimal string (e.g. '0.35'). Muted state is deliberately not saved: autoplay policy forces muted starts. */
  LOCAL_PLAYER_VOLUME: 'prism_player_volume',
  /** The streams this viewer starred on the HLS / DASH page: a JSON array of their short ids (at most 1000). */
  LOCAL_FAVORITE_STREAMS: 'prism_favorite_streams',
  /** Id of this browser tab, so a chat pop-out knows which tab owns it. Survives a reload. */
  SESSION_TAB_ID: 'prism_tab_id',
  /** Set once the rail's automatic "Check live" has run in this tab's visit. */
  SESSION_YOUTUBE_LIVE_AUTO: 'prism_youtube_live_auto',
  /** The owner's admin token (identity only, no permissions). Never the viewer token, and gone when the tab closes. */
  SESSION_ADMIN_TOKEN: 'prism_admin_token',
  /** OAuth state nonce for the admin sign-in round trip (always starts with `admin.`). */
  SESSION_ADMIN_OAUTH_STATE: 'prism_admin_oauth_state',
  /** The /admin page to return to once Twitch sends the owner back to the site root. */
  SESSION_ADMIN_RETURN: 'prism_admin_return',
} as const
