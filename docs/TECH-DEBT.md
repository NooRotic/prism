# Tech Debt Backlog

> Discovered during cleanup sprint 2026-04-29. Review and prioritize per-phase.

---

## HIGH - Fix before next feature phase

### Silent error swallowing
- `src/pages/YoutubePlayerPage.tsx:36` - `.catch(() => {})` on video metadata fetch. User sees nothing on failure.
- `src/components/search/QuickLinks.tsx:19` - `.catch(() => {})` for getTopGames. Grid shows empty with no feedback.
- `src/components/player/VideoJSPlayer.tsx:86` - `player.play()?.catch(() => {})` suppresses autoplay failures silently.

### `twitch_access_token` key hardcoded in multiple files
- `src/lib/twitchAuth.ts` and `src/lib/twitchApi.ts` both hardcode the string `'twitch_access_token'`.
- Should be a shared constant to prevent key drift.

---

## MEDIUM - Address during refactor phases

### Type safety: `as any` casts on player SDKs
- `DashJSPlayer.tsx:25,62,181-182` - cast dashjs player to any for bitrate access
- `TwitchEmbedPlayer.tsx:290-303` - 7 `(p as any)` casts for playback stats
- `VideoJSPlayer.tsx:117-122` - `(player as any)` and `(vidEl as any)` casts
- `youtubeApi.ts:88,101` - eslint-disable for YouTube API JSON mapping
- Fix: create typed interfaces for each SDK's runtime API surface

### localStorage key sprawl
8 keys + `prism_yt_cache_*` prefix scattered across files with no central registry:
- `prism_onboarding_seen` (App.tsx)
- `prism_following_sort` (AppContext.tsx)
- `prism_intros_seen` (useIntroState.ts)
- `prism_search_history` (searchHistory.ts)
- `prism_yt_cache_*` (youtubeCache.ts)
- `prism_panel_ratio` (TwitchPlayerPage.tsx)
- `prism_migrated` (App.tsx)
- `twitch_access_token` (twitchAuth.ts, twitchApi.ts)
- Fix: create `src/config/storageKeys.ts` with a `STORAGE_KEYS` enum

### Large components (candidates for splitting)
| File | Lines | Split idea |
|------|-------|------------|
| YourStatsPanel.tsx | 865 | Extract StatCard subcomponents |
| PlayerHost.tsx | 406 | Separate error boundary from fallback chain |
| TwitchEmbedPlayer.tsx | 390 | Extract script loader + playback state hook |
| ProfileSidebar.tsx | 334 | Extract stat sections |
| AppContext.tsx | 331 | Extract reducer to separate file |
| CategoryPanel.tsx | 325 | Extract stream fetching to hook |

### Console logging in production
9 instances of console.warn/error across:
- `shaderUtils.ts` (4x) - WebGL shader failures
- `youtubeCache.ts` (2x) - localStorage quota exceeded
- `ShaderBackground.tsx` (1x) - WebGL2 not available
- `twitchAuth.ts` (2x) - missing client ID, OAuth state mismatch
- Fix: route through a debug logger that respects env (dev vs prod)

### Hardcoded timeout values
15+ magic number timeouts spread across player components. Named constants exist for some (`EMBED_TIMEOUT_MS`, `IFRAME_LOAD_GRACE_MS`, `LOAD_TIMEOUT_MS`) but not all. Inconsistent pattern.

---

## LOW - Nice-to-have, no urgency

### Accessibility gaps
- `DashJSPlayer.tsx` - no role on interactive elements
- `RemixButton.tsx` - has `title` but no `aria-label`
- `ProtocolCard.tsx` - card button lacks aria-label
- Coverage is generally decent (SlidedownPanel, DebugPanel, ExpandablePill all correct)

### Inline styles vs Tailwind mixing
- `RemixButton.tsx` - entire button styled with `style={{...}}`
- `ChannelIntro.tsx` - animation inline styles alongside Tailwind
- `FallbackCard.tsx` - mixed approach
- `Header.tsx` - gradient backgrounds inline

### Hardcoded RGBA colors
Multiple components repeat `rgba(145, 70, 255, 0.08|0.15|0.2|0.4)` (Twitch purple variants). Should be CSS custom properties or Tailwind theme tokens.

### Missing error boundaries on fetch pages
- `YoutubePlayerPage.tsx` - no error UI for metadata fetch
- `TwitchPlayerPage.tsx` - no error UI for channel data
- `HlsDashPlayerPage.tsx` - no error boundary around player
- `PlayerHost.tsx` has an ErrorBoundary but only catches sync render errors, not async fetch failures

### Migration cleanup
`migrateLocalStorageKeys()` in App.tsx migrates `glaze_*` to `prism_*` but never deletes old keys after migration. The `prism_migrated` flag prevents re-runs but stale `glaze_*` keys persist forever.

### API defaults not configurable
- `youtubeApi.ts:34-35` - `maxResults=12, regionCode='US'` as function defaults
- `twitchApi.ts` - various `first: number` defaults (100, 50, 20, 10) hardcoded in function signatures

---

## RESOLVED (this sprint)

- [x] ~~Delete dead AppShell.tsx (293 lines)~~ - removed
- [x] ~~Delete dead useDeepLink.ts (137 lines)~~ - removed + barrel export cleaned
- [x] ~~Remove unused SET_DISPLAY_MODE action~~ - removed from reducer + action union type
