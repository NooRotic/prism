# Tech Debt Backlog

> Discovered during cleanup sprint 2026-04-29. Review and prioritize per-phase.

---

## HIGH - Fix before next feature phase

### OAuth state check fails open (security)
`src/lib/twitchAuth.ts` - `handleTwitchRedirect()` guards CSRF with:
```ts
if (state && savedState && state !== savedState) { /* reject */ }
```
Both operands must be present for the check to run at all. If the callback
omits `state`, or `sessionStorage` has no `savedState` (cleared, different tab,
storage blocked), validation is **skipped** and the token is accepted.
Omitting the parameter entirely is the easiest bypass.
- Fix: reject whenever `savedState` is missing or `state !== savedState`.
  Only accept on an explicit match. Add a test for each fail-open path —
  nothing in the current suite covers them.
- Found during review of PR #45 (2026-09-21). Pre-existing, not introduced there.

### Silent error swallowing - user-facing half still open
PR #45 replaced the three `.catch(() => {})` bodies with `logger.warn`, but
`logger.warn` is dev-only (`import.meta.env.DEV`). **In production the user
still gets no feedback** - which is what the original entry was about.
- [x] `VideoJSPlayer.tsx` - genuinely fixed. Distinguishes `AbortError`
      (ignore), `NotAllowedError` (fires `onPlaybackBlocked?.()`), other.
- [ ] `src/pages/YoutubePlayerPage.tsx` - metadata fetch failure needs a
      visible state, not just a dev log.
- [ ] `src/components/search/QuickLinks.tsx` - grid still renders empty with
      no explanation on `getTopGames` failure.
- Fix: give both an error state in the UI (retry affordance or explanatory
  empty state).

### ~~`twitch_access_token` key hardcoded in multiple files~~ - RESOLVED (PR #45)
Now `STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN` in `src/config/storageKeys.ts`.

---

## MEDIUM - Address during refactor phases

### ~~Type safety: `as any` casts on player SDKs~~ - RESOLVED (PR #45)
Typed interfaces now live in `src/types/player-sdk.ts` (dashjs, Twitch Embed,
Video.js + VHS). All members are optional and consumed with `?.`, so a
runtime-missing method degrades exactly as the old casts did.
- Still open: `youtubeApi.ts:88,101` eslint-disable for YouTube JSON mapping.

### Connect-prompt markup duplicated across four components
`FavoritesCard.tsx`, `ProtocolPage.tsx`, `StatsRow.tsx` and `ProfileSidebar.tsx`
each hand-roll the same Lock icon + copy + gradient "connect twitch" button.
- Fix: extract a single `ConnectTwitchPrompt` component and use it in all four.
- Not done during the logged-out defect fix on purpose — unrelated refactoring
  inside a defect PR.

### `useTwitchAuth` holds auth in per-instance state
The hook keeps `token`/`isAuthenticated` in its own `useState` per caller, so
every consumer has an independent copy. There are now six callers. They agree
on mount (each initialises from `localStorage`), but an auth change that does
not remount the tree — notably `logout()` — updates only the calling instance
plus AppContext, leaving other instances stale.
- Not resolved by reading `state.auth.isAuthenticated` instead: AppContext
  initialises auth to `false` (`AppContext.tsx:132`) and only flips after an
  effect dispatches `LOGIN`, which would flash the signed-out UI on every page
  load for signed-in users.
- Fix: initialise AppContext auth from `getStoredToken()` so context is correct
  on first render, then have consumers read context and retire the per-instance
  state.

### ~~localStorage key sprawl~~ - RESOLVED (PR #45)
All 9 keys now registered in `src/config/storageKeys.ts` as `STORAGE_KEYS`.
Note: the `glaze_*` source names in `App.tsx`'s one-time migration stay raw
on purpose (frozen historical names); only the destinations are centralized.
The comment above that block currently says "Do NOT centralize these" while
the destinations *are* centralized - reword it to say only the `glaze_*`
sources are frozen.

### Large components (candidates for splitting)
| File | Lines | Split idea |
|------|-------|------------|
| YourStatsPanel.tsx | 865 | Extract StatCard subcomponents |
| PlayerHost.tsx | 406 | Separate error boundary from fallback chain |
| TwitchEmbedPlayer.tsx | 390 | Extract script loader + playback state hook |
| ProfileSidebar.tsx | 334 | Extract stat sections |
| AppContext.tsx | 331 | Extract reducer to separate file |
| CategoryPanel.tsx | 325 | Extract stream fetching to hook |

### ~~Console logging in production~~ - RESOLVED (PR #45), with a caveat
All 9 instances now route through `src/lib/logger.ts`, which is env-aware:
`error` always fires, `warn`/`debug` are dev-only.

**Caveat introduced by the fix:** two of these were useful in a production
console when triaging a user bug report, and are now silent:
- `[ShaderBackground] WebGL2 not available` - explains "the background is black"
- `[youtubeCache] localStorage quota exceeded` - explains "browsing stopped caching"
- Consider: promote these two to `logger.error`, or add a `logger.report`
  level that survives production for diagnosable degradations.

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
