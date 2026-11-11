# Twitch Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo grid on `/twitch` with a dashboard for a signed-in viewer (live wall, follow stats, category rows, and for streamers a TwitchTracker-backed stat row with three 30-day charts).

**Architecture:** Pure stat functions in `src/lib` feed small presentational components in `src/components/dashboard/`; one container (`TwitchDashboard`) reads the existing shared follows store and the auth context, and `ProtocolPage` mounts it for the Twitch protocol. The streamer row adds a browser-side TwitchTracker client with a localStorage cache, and two history hooks over Helix. No server, no new dependency, no new OAuth scope.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind v4, react-router-dom, Vitest + Testing Library (jsdom, globals on).

**Spec:** `docs/superpowers/specs/2026-11-11-twitch-dashboard-design.md` (approved by the owner 2026-11-11; the numbered "My calls" below are its calls 1 to 20). Mockups in `docs/superpowers/specs/2026-11-11-twitch-dashboard-mockups/`.

## Branches and pull requests

Two PRs, one after the other (not stacked): **Part 1 (Tasks 1 to 10)** is the dashboard every signed-in viewer sees; **Part 2 (Tasks 11 to 16)** adds the streamer row and charts. Rename the current local branch first: `git branch -m docs/dashboard-design feat/twitch-dashboard` (it already holds the spec and this plan). Open PR 1 from that branch after Task 10. Start Part 2 on a fresh branch `feat/twitch-dashboard-streamer` cut from `main` **after PR 1 is merged** (the owner merges; do not merge yourself). Commit after every task. **Commit messages carry no `Co-Authored-By` line (the owner's rule); the PR description does.** Never commit to `main`.

Test command used throughout (Windows; `npx` is rewritten by the output wrapper, so call vitest directly):
`node ./node_modules/vitest/vitest.mjs run <paths> --maxWorkers=2`. Type check: `node ./node_modules/typescript/bin/tsc -b`. Lint: `node ./node_modules/eslint/bin/eslint.js <paths>`. If a suite fails to load with `UNKNOWN ... aria-query`, re-run once before investigating.

## Global Constraints

- Twitch API calls only through `src/lib/twitchApi.ts`; storage keys only through `src/config/storageKeys.ts` (`LOCAL_*` for localStorage); env vars `VITE_`-prefixed (none added); Tailwind v4 with the tokens in `src/index.css`; forward slashes in paths.
- No new runtime dependency; no new OAuth scope (`SCOPES` in `src/lib/twitchAuth.ts` is untouched).
- Wall shows **8** live tiles at width >= 1024px and **6** below, then "+ N more live" expanding in place (call 11). "Just went live" chip = started within **30 minutes** (`30 * 60 * 1000` ms). Cards list the top **3**. Category rows show **6**, then "+ N more categories".
- The viewer's chat name colour is lightened until it reaches **4.5:1** on `#0c0c10` (call 16). Every new text colour reaches 4.5:1 on its box; do not reuse the mockups' dim `#8f7a3e`.
- TwitchTracker: `GET https://twitchtracker.com/api/channels/summary/<login>`; **6 hours** cache for a real answer, **1 hour** for `{}`; `{}` and any failure mean "no data" and render `–`, never `0`; HTTP 429 stops all further calls for the session; one constant `TWITCHTRACKER_ENABLED` switches the client off (call 20).
- Twitch-sourced history: followers paged **100 per page, at most 10 pages**, newest first, stop at the first `followed_at` older than 30 days; cached in memory per user id for **15 minutes**; bucketing by the viewer's **local calendar day**; a broadcast counts for the day it started.
- "Streamer" = `broadcaster_type` is `affiliate` or `partner` (the rule in `YourStatsPanel.tsx`).
- A `SessionExpiredError` from any dashboard call signs the viewer out (clear the token, dispatch `TOKEN_EXPIRED`) and the signed-out card says the sign-in expired (call 14).
- Signed out: no call that needs a token and no TwitchTracker call.

## Review Focus

The inputs and conditions the spec implies but the task tests could miss; each has a test in the named task.

1. **Follows partly loaded** (cursor still present): counts show a `+` floor, not a false total; no "Load more". Task 7 and Task 10.
2. **Token expires while the page is open** (401 from the follows store, the chat colour, or a streamer call, including a missing-scope 401): the page flips to the signed-out card saying it expired; no dead Retry. Tasks 9, 10, 16.
3. **TwitchTracker misbehaves** (`{}`, wrong shape, non-number field, network error, CORS block, 429, slow answer): `–` chips, Twitch-sourced chips still shown, page never waits, chip heights reserved so nothing jumps. Tasks 11 and 16.
4. **Short or missing recordings** (retention under 30 days, no archives at all, zero follows in 30 days): captions say how far back, days before the oldest recording draw no bar (not a zero bar), big numbers fall back without the TT tag. Tasks 13 and 15.
5. **Profile not loaded yet or failed** (`state.auth.user` null): skeleton, never "not a streamer"; a failed profile call shows an error card with Retry. Tasks 9 and 10.

---

## Before Task 1

- [ ] `git branch -m docs/dashboard-design feat/twitch-dashboard`; `git status --short` is empty.
- [ ] Baseline: run the whole suite once and note the passing count: `node ./node_modules/vitest/vitest.mjs run --maxWorkers=2`. Expected: all pass (949 at the time of writing).

---

# Part 1: the dashboard for every signed-in viewer

### Task 1: Keep the stream language on follows

**Files:**
- Modify: `src/lib/followsStore.ts` (the `EnrichedFollow` interface and `enrichFollows`)
- Create: `src/lib/__tests__/followsStore.enrich.test.ts`

**Interfaces:**
- Produces: `EnrichedFollow.language?: string` (raw Twitch code such as `en`); `export function enrichFollows(follows: TwitchFollowedChannel[], liveStreams: TwitchStream[]): EnrichedFollow[]` (today it is not exported).

- [ ] **Step 1: Write the failing test** `followsStore.enrich.test.ts`. Build one `TwitchFollowedChannel` and one `TwitchStream` fixture (cast partial objects). Tests: `keeps the stream language on a live follow` (stream `language: 'de'` gives `result[0].language === 'de'`); `leaves language undefined on an offline follow`; `still carries viewerCount, gameName and startedAt for a live follow`.
- [ ] **Step 2: Run it.** Expected: FAIL (`enrichFollows` is not a function / not exported).
- [ ] **Step 3: Implement.** Add `language?: string` to `EnrichedFollow`, `export` the function, and set `language: stream.language` in the live branch only. Additive; no other change.
- [ ] **Step 4: Run** the new test plus `src/components/rail src/components/layout`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: keep the stream language on enriched follows`.

### Task 2: Move `sortNewestLiveFirst` to a shared place

**Files:**
- Move: `src/components/rail/sortLiveFollows.ts` to `src/lib/sortLiveFollows.ts` (fix its `EnrichedFollow` import to `./followsStore`)
- Move: `src/components/rail/__tests__/sortLiveFollows.test.ts` to `src/lib/__tests__/sortLiveFollows.test.ts` (import `../sortLiveFollows`)
- Modify: `src/components/rail/ChannelRail.tsx` (import from `../../lib/sortLiveFollows`)

**Interfaces:** Produces: `sortNewestLiveFirst(follows: EnrichedFollow[]): EnrichedFollow[]` at its new path, behaviour unchanged.

- [ ] **Step 1:** `git mv` both files and update the three imports.
- [ ] **Step 2: Run** `src/lib/__tests__/sortLiveFollows.test.ts src/components/rail`. Expected: PASS (same tests, new path).
- [ ] **Step 3: Commit** `refactor: move sortNewestLiveFirst to lib so the dashboard can share it`.

### Task 3: Follow statistics (pure)

**Files:**
- Create: `src/lib/dashboardStats.ts`
- Test: `src/lib/__tests__/dashboardStats.test.ts`

**Interfaces:**
- Consumes: `EnrichedFollow` (Task 1), `sortNewestLiveFirst` (Task 2).
- Produces (all exported):
  - `const JUST_WENT_LIVE_MS = 30 * 60 * 1000`
  - `formatCompactDuration(ms: number): string`
  - `compactCount(n: number): string`
  - `interface FollowStats { liveCount: number; loadedCount: number; watching: number; typicalUptimeMs: number | null; justWentLive: number; longest: { name: string; ms: number } | null; languages: { language: string; count: number }[]; oldestLive: { name: string; year: number } | null }`
  - `computeFollowStats(follows: EnrichedFollow[], now: number): FollowStats`
  - `interface CategoryRow { name: string; liveCount: number; viewers: number }`
  - `groupCategories(follows: EnrichedFollow[]): CategoryRow[]`
  - `recentlyStarted(follows: EnrichedFollow[], limit?: number): EnrichedFollow[]` and `mostWatched(follows: EnrichedFollow[], limit?: number): EnrichedFollow[]` (default limit 3)

- [ ] **Step 1: Write the failing tests.**
  - `formatCompactDuration`: `4*60_000` is `'4m'`; `65*60_000` is `'1h 05m'`; `4*3_600_000` is `'4h'`; `160*60_000` is `'2h 40m'`; `0` and negatives are `'0m'`.
  - `compactCount`: `0` is `'0'`, `999` is `'999'`, `1000` is `'1k'`, `1234` is `'1.2k'`, `8100` is `'8.1k'`, `12345` is `'12.3k'`, `999_999` is `'1M'`, `1_250_000` is `'1.3M'`.
  - `computeFollowStats`: ignores offline follows for every live figure; `loadedCount` is `follows.length`; `watching` sums `viewerCount`; `typicalUptimeMs` is the median of current uptimes (odd: middle value; even: mean of the middle two, rounded) and `null` with no live follow; `justWentLive` counts uptimes `<= JUST_WENT_LIVE_MS` (a follow exactly 30 minutes in counts, 31 does not); `longest` is the largest uptime with its `broadcaster_name`; `languages` counts `language` across live follows sorted by count desc then code asc, skipping a missing language; `oldestLive` is the live follow with the earliest `followed_at`, `year` from that date; a live follow with an unreadable `startedAt` still counts in `liveCount` and `watching` but not in the uptime figures.
  - `groupCategories`: live follows only, grouped by `gameName`, sorted by `viewers` desc then name; empty or missing `gameName` goes under `'No category'`.
  - `recentlyStarted` returns the 3 newest live (any uptime); `mostWatched` the top 3 by `viewerCount`; both skip offline follows and do not mutate the input.
- [ ] **Step 2: Run.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the signatures above. Uptime is `Math.max(0, now - Date.parse(startedAt))`. Use `sortNewestLiveFirst` for `recentlyStarted`. `compactCount`: under 1000 plain; else divide, round to one decimal, drop a trailing `.0`, suffix `k` or `M`; promote to `M` when rounding reaches 1000k.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: pure follow statistics for the dashboard`.

### Task 4: Contrast helper

**Files:**
- Create: `src/lib/contrast.ts`
- Test: `src/lib/__tests__/contrast.test.ts`

**Interfaces:** Produces: `const DASHBOARD_BG = '#0c0c10'`; `contrastRatio(foreground: string, background: string): number | null`; `ensureContrast(color: string, background?: string, min?: number): string | null` (defaults `DASHBOARD_BG`, `4.5`).

- [ ] **Step 1: Write the failing tests.** `contrastRatio('#FFFFFF', '#000000')` is `21`; `contrastRatio('#000000','#000000')` is `1`; invalid input (`'red'`, `'#fff'`, `''`) gives `null`. `ensureContrast`: a colour that already passes (`'#FFFFFF'`) is returned unchanged; `'#000000'` and `'#9146FF'` come back different with `contrastRatio(result, DASHBOARD_BG) >= 4.5`; lower-case hex is accepted; invalid input gives `null`.
- [ ] **Step 2: Run.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** WCAG relative luminance (sRGB to linear), ratio `(L1 + .05) / (L2 + .05)` with the lighter first. `ensureContrast` mixes the colour toward white in steps of 0.05 (`channel + (255 - channel) * t`, rounded) and returns the first result that reaches `min`, else `'#FFFFFF'`. Accept only `#RRGGBB`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: contrast helper for the viewer's chat colour`.

### Task 5: Chat colour API call

**Files:**
- Modify: `src/lib/twitchApi.ts` (add after `getAuthenticatedUser`)
- Test: `src/lib/__tests__/twitchApi.getChatColor.test.ts` (mirror the fetch mocking in `twitchApi.getStreamsByUserIds.test.ts`)

**Interfaces:** Produces: `getChatColor(userId: string): Promise<string | null>` (Helix `GET chat/color?user_id=`; no new scope).

- [ ] **Step 1: Write the failing tests.** Returns `'#9146FF'` for `{ data: [{ color: '#9146FF' }] }`; returns `null` for an empty string colour and for `{ data: [] }`; a 401 rejects with `SessionExpiredError` and clears the token; the request URL contains `chat/color` and `user_id=42`.
- [ ] **Step 2: Run.** Expected: FAIL (`getChatColor` is not a function).
- [ ] **Step 3: Implement** through `twitchApiFetch<{ data: { color: string }[] }>('chat/color', { user_id: userId })`; return `data.data?.[0]?.color || null`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: getChatColor`.

### Task 6: Stat chips, category rows and the two cards

**Files:**
- Create: `src/components/dashboard/FollowChips.tsx`, `CategoryRows.tsx`, `FollowCards.tsx`
- Test: `src/components/dashboard/__tests__/FollowChips.test.tsx`, `CategoryRows.test.tsx`, `FollowCards.test.tsx`

**Interfaces:**
- Consumes: `FollowStats`, `CategoryRow`, `compactCount`, `formatCompactDuration` (Task 3).
- Produces: `FollowChips({ stats: FollowStats; more: boolean })`; `CategoryRows({ rows: CategoryRow[]; onOpen: (name: string) => void })`; `FollowCards({ recent: EnrichedFollow[]; top: EnrichedFollow[]; now: number })`.

- [ ] **Step 1: Write the failing tests.**
  - `FollowChips`: a `<ul aria-label="Follow stats">` with seven labelled items: `Live now` (`17 / 59`, and `17 / 59+` when `more`), `Watching (all follows)` (`8.1k`), `Typical time live` (`2h 40m`), `Just went live`, `Longest live` (`5h 18m · ragnarok_`), `Languages` (top three, `EN 14 · DE 2 · FR 1`), `Oldest follow live` (`kestrel · 2019`). With no live follows the last four show `–` and the counts show `0`.
  - `CategoryRows`: shows 6 rows then a `+ N more categories` button that expands in place; each row is a button whose accessible name reads `Just Chatting, 6 live, 2.3k watching` and clicking it calls `onOpen('Just Chatting')`; the `No category` row is plain text, not a button.
  - `FollowCards` (wrap in `MemoryRouter`): a `Just went live` card with up to three names and their `formatCompactDuration` uptimes, a `Most watched` card with `compactCount` viewers; each name links to `/twitch/<login>`; an empty list renders nothing for that card.
- [ ] **Step 2: Run.** Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** as plain presentational components using the existing tokens (`--bg-card`, `--border`, `--text-secondary`, `--accent-green`, `--accent-twitch`). Default props only; no data fetching.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: dashboard stat chips, category rows and cards`.

### Task 7: The live wall (tiles, list, cap, offline line)

**Files:**
- Modify: `src/config/storageKeys.ts` (add `LOCAL_DASHBOARD_WALL_VIEW: 'prism_dashboard_wall_view'`)
- Create: `src/components/dashboard/LiveWall.tsx`, `src/components/dashboard/useWallCap.ts`
- Test: `src/components/dashboard/__tests__/LiveWall.test.tsx`, `useWallCap.test.ts`

**Interfaces:**
- Consumes: `compactCount`, `formatCompactDuration` (Task 3).
- Produces: `useWallCap(): number` (8 when `window.innerWidth >= 1024`, else 6; follows `resize` events); `LiveWall({ live: EnrichedFollow[]; offlineCount: number; more: boolean; now: number; cap: number; onOpenFollowing: () => void })` where `live` is already newest-first.

- [ ] **Step 1: Write the failing tests.** `useWallCap`: returns 8 at `innerWidth = 1280`, 6 at `800`, and updates after a `resize` event. `LiveWall` (wrap in `MemoryRouter`): Wall is the default tab and `Wall`/`List` tabs (`role="tab"` with `aria-selected`) switch views; the chosen tab is stored under `LOCAL_DASHBOARD_WALL_VIEW` and restored on remount; with 12 live and `cap = 8` it shows 8 tiles and a `+ 4 more live` button, which expands to 12 and offers `Show fewer`; a tile links to `/twitch/<login>`, shows viewers (`compactCount`), name, `gameName` and uptime, and its accessible name includes the channel name, category and viewer count; the thumbnail `src` has `{width}x{height}` replaced (`320x180`); the offline line reads `42 offline`, and `42+ offline` when `more`, and is a button that calls `onOpenFollowing`; List view shows name, category, viewers and uptime per row.
- [ ] **Step 2: Run.** Expected: FAIL (modules not found). (`window.matchMedia` in `src/test/setup.ts` cannot be overridden, which is why the cap reads `innerWidth`.)
- [ ] **Step 3: Implement.** Read and write the stored tab inside try/catch (storage can throw). Tiles are `Link`s; keep tile height fixed so the page does not jump as thumbnails load.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: dashboard live wall with list view, cap and offline line`.

### Task 8: Identity strip and the chat colour hook

**Files:**
- Create: `src/components/dashboard/IdentityStrip.tsx`, `src/components/dashboard/useChatColor.ts`
- Test: `src/components/dashboard/__tests__/IdentityStrip.test.tsx`, `useChatColor.test.ts`

**Interfaces:**
- Consumes: `ensureContrast`, `DASHBOARD_BG` (Task 4), `getChatColor` (Task 5), `compactCount` (Task 3), `TwitchUser`.
- Produces: `useChatColor(userId: string | null, onSessionExpired: () => void): string | null` (fetches once per id, swallows other errors, calls `onSessionExpired` on `SessionExpiredError`); `IdentityStrip({ user: TwitchUser; chatColor: string | null; following: number; followingMore: boolean; liveCount: number; watching: number })`.

- [ ] **Step 1: Write the failing tests.** `useChatColor`: returns `null` then the colour; no request when `userId` is null; a 401 calls `onSessionExpired` once and returns `null`; any other error returns `null` silently. `IdentityStrip`: shows the profile picture (`alt` names the user), `display_name` coloured by `ensureContrast(chatColor, DASHBOARD_BG)` and by `var(--text-primary)` when the colour is `null` or invalid; an `AFFILIATE` / `PARTNER` badge from `broadcaster_type` (none when empty); `following 59` (`59+` when `followingMore`); `account since 2016` from `created_at`; the right side `17 live of 59` and `8.1k watching right now`; with an empty `profile_image_url` it shows the initial letter instead of a broken image.
- [ ] **Step 2: Run.** Expected: FAIL (modules not found).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: dashboard identity strip with the viewer's chat colour`.

### Task 9: Auth lifecycle (profile failure, expiry, shared hooks)

**Files:**
- Modify: `src/contexts/AppContext.tsx` (auth state and reducer), `src/App.tsx` (use the new hook instead of the inline profile effect)
- Create: `src/hooks/useAuthProfile.ts`, `src/hooks/useSessionExpiry.ts`
- Test: `src/contexts/__tests__/AppContext.auth.test.tsx`, `src/hooks/__tests__/useAuthProfile.test.tsx`, `src/hooks/__tests__/useSessionExpiry.test.tsx`

**Interfaces:**
- Produces: `AppState.auth` gains `profileError: boolean` and `expired: boolean` (both `false` initially, in `initialState` and `initAppState`); new actions `{ type: 'LOGIN_USER_FAILED' }` and `{ type: 'LOGIN_USER_RETRY' }`; `useAuthProfile(): void` (the effect now at `src/App.tsx:54-69`, moved); `useSessionExpiry(): () => void` (returns a stable callback that calls `clearToken()` from `lib/twitchAuth` and dispatches `{ type: 'TOKEN_EXPIRED' }`).
- Reducer rules: `LOGIN_USER_LOADED` sets `user` and `profileError: false`; `LOGIN_USER_FAILED` sets `profileError: true`; `LOGIN_USER_RETRY` sets `profileError: false`; `TOKEN_EXPIRED` signs out (as today) **and** sets `expired: true`; `LOGOUT` signs out with `expired: false`; `LOGIN` sets `expired: false` and `profileError: false`.

- [ ] **Step 1: Write the failing tests.** Reducer, through `renderHook(() => useApp(), { wrapper: AppProvider })`: each transition above. `useAuthProfile` (mock `getAuthenticatedUser` and `useTwitchAuth`): fetches the profile once after `isAuthenticated` turns true and dispatches `LOGIN_USER_LOADED`; a non-401 failure dispatches `LOGIN_USER_FAILED` and does **not** refetch in a loop; dispatching `LOGIN_USER_RETRY` fetches again; a `SessionExpiredError` goes to `handleAuthError`, as today. `useSessionExpiry`: calling the callback removes the stored token and leaves the state signed out with `expired === true`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The effect must skip while `profileError` is true and re-run when it becomes false. Keep behaviour identical for a successful login (the existing `App` has no test of its own, so the new hook test is the safety net).
- [ ] **Step 4: Run** the new tests plus `src/__tests__ src/contexts src/hooks`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: profile failure and session-expired state, shared auth hooks`.

### Task 10: The dashboard container, signed-out card and the `/twitch` wiring

**Files:**
- Create: `src/components/dashboard/TwitchDashboard.tsx`, `src/components/dashboard/SignedOutCard.tsx`, `src/components/dashboard/DashboardSkeleton.tsx`
- Modify: `src/pages/ProtocolPage.tsx` (the content area: for `protocol === 'twitch'` render the dashboard when signed in, else the card above the existing `DemoGrid`)
- Test: `src/components/dashboard/__tests__/TwitchDashboard.test.tsx`, `src/pages/__tests__/ProtocolPage.twitch.test.tsx`

**Interfaces:**
- Consumes: Tasks 3 to 9; `useFollowedChannels(userId, { handleAuthError })` from `src/hooks/useFollowedChannels.ts`; `useApp`; `useSessionExpiry`; `OPEN_CATEGORY_PANEL`, `TOGGLE_NAV_PANEL` (`panel: 'following'`).
- Produces: `TwitchDashboard(): ReactElement`; `SignedOutCard({ expired: boolean; onConnect: () => void })` using `ConnectTwitchButton`; `DashboardSkeleton()`.

- [ ] **Step 1: Write the failing tests.** `TwitchDashboard` (mock `useFollowedChannels`, `useApp`, `useSessionExpiry`, `useChatColor`; follow the mocking style of `FollowingPanel.test.tsx`):
  - profile `null` and no error shows the skeleton and no strip; profile `null` with `profileError` shows an error card whose Retry dispatches `LOGIN_USER_RETRY`;
  - follows `loading` shows the skeleton; a non-expiry `error` shows the message and a Retry that calls `refetch`;
  - the follows hook is called with an `handleAuthError` that invokes `useSessionExpiry`'s callback (assert by calling the passed function);
  - with live follows: the identity strip, the seven chips, the wall in newest-first order, the category rows and both cards are present; clicking a category row dispatches `OPEN_CATEGORY_PANEL` with that `gameName`; the offline line dispatches `TOGGLE_NAV_PANEL` for `'following'`;
  - `cursor` non-null: the chips and strip show the `+` floor and there is no "Load more" control;
  - nobody live: chips show `0` / `–`, the wall is replaced by `No one you follow is live` with the offline count and a link to `https://www.twitch.tv/directory` (new tab); follows empty: a short message with the same link and no chips.
  - `SignedOutCard`: default copy `Connect Twitch to see who you follow that is live.`; with `expired` it says `Your Twitch sign-in expired. Connect again to see who you follow that is live.`; the button calls `onConnect`.
  - `ProtocolPage` (mock `useApp`/`useTwitchAuth`, stub `TwitchDashboard` and `DemoGrid`): signed out on `/twitch` shows the card (with `expired` from state) **and** the demo grid, and makes no dashboard call; signed in shows the dashboard and no demo grid; `protocol="youtube"` and `"hls-dash"` are unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Layout per the spec: strip, chips, then (two columns at `lg` and up, one column below) the wall with a right column of `CategoryRows` and `FollowCards`. `now` comes from a one-minute interval so uptimes tick without refetching. Live follows are `sortNewestLiveFirst(data.filter(f => f.isLive))`; `offlineCount` is the loaded offline count; `following` is `loadedCount`. The follows hook gets `handleAuthError: onSessionExpired`. Reserve skeleton heights equal to the real blocks. Phone (below `md`): the identity strip stacks, the chips wrap into a two-column grid, the wall shows two tiles per row, and the right-hand cards drop below the wall.
- [ ] **Step 4: Run** the new tests, then the whole suite `--maxWorkers=2`, `tsc -b`, and `eslint` on changed paths. Expected: all PASS / clean.
- [ ] **Step 5: Manual check** in the built-in browser against `http://localhost:5000/twitch` (dev server serves the checked-out branch; signed-in state is driven by seeding a token and mocking Twitch `fetch`): screenshot at 1100px and 375px wide, confirm the layout matches `dashboard-v2.html`, then reset the viewport to desktop.
- [ ] **Step 6: Commit** `feat: the /twitch dashboard for signed-in viewers`, then push the branch and open **PR 1** (description ends with the `Co-Authored-By` attribution lines). Stop; wait for the owner to merge before Part 2.

---

# Part 2: the streamer row and 30-day charts

(Branch `feat/twitch-dashboard-streamer` from the merged `main`.)

### Task 11: TwitchTracker client and hook

**Files:**
- Modify: `src/config/storageKeys.ts` (add `LOCAL_TWITCHTRACKER_CACHE_PREFIX: 'prism_tt_cache_'`)
- Create: `src/lib/twitchTracker.ts`, `src/hooks/useTrackerSummary.ts`
- Test: `src/lib/__tests__/twitchTracker.test.ts`, `src/hooks/__tests__/useTrackerSummary.test.tsx`

**Interfaces:** Produces: `const TWITCHTRACKER_ENABLED = true`; `interface TrackerSummary { rank: number | null; minutesStreamed: number | null; avgViewers: number | null; maxViewers: number | null; hoursWatched: number | null; followersGained: number | null; followersTotal: number | null }`; `parseTrackerSummary(json: unknown): TrackerSummary | null`; `fetchTrackerSummary(login: string, now?: number): Promise<TrackerSummary | null>`; `resetTrackerSession(): void` (tests only); `useTrackerSummary(login: string | null): { summary: TrackerSummary | null; loading: boolean }`.

- [ ] **Step 1: Write the failing tests.** `parseTrackerSummary`: the real answer `{rank:3290,minutes_streamed:652,avg_viewers:1226,max_viewers:2894,hours_watched:13314,followers:13874,followers_total:2484840}` maps every field; `{}`, `null`, an array and a string give `null`; a non-finite or non-number field becomes `null` for that field only; all fields `null` gives `null` overall. `fetchTrackerSummary` (mock `fetch`): requests `https://twitchtracker.com/api/channels/summary/<login>` and sends no `Authorization`; rejects a login that is not `/^[A-Za-z0-9_]{1,25}$/` without any request; a cache hit inside 6 hours makes no request; an expired cache (6h) refetches; an `{}` answer is cached for 1 hour (hit at 59 minutes, refetch at 61); a network error, a non-200 and invalid JSON each resolve `null` and are not written to `localStorage`, and a second call in the same session makes no new request; HTTP 429 resolves `null` and every later call that session makes no request; `TWITCHTRACKER_ENABLED = false` (mock the module constant) makes no request. Hook: `null` login means no request and `summary: null, loading: false`; otherwise `loading` then the summary.
- [ ] **Step 2: Run.** Expected: FAIL (modules not found).
- [ ] **Step 3: Implement.** Cache record `{ fetchedAt: number; summary: TrackerSummary | null }` under the prefix plus the lower-cased login; storage reads and writes in try/catch; `minutesStreamed` etc. map from the snake_case fields; module-level `rateLimited` flag and a per-login in-flight/failed memo.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: TwitchTracker summary client with cache and silent failure`.

### Task 12: Followers-by-date call and `getVideos` options

**Files:**
- Modify: `src/lib/twitchApi.ts` (`getVideos`; new function after `getBroadcasterFollowerCount`)
- Test: `src/lib/__tests__/twitchApi.history.test.ts`

**Interfaces:** Produces: `getFollowerDates(broadcasterId: string, sinceMs: number, maxPages?: number): Promise<{ dates: string[]; total: number; reachedCap: boolean }>` (default `maxPages` 10, 100 per page); `getVideos(userId: string, first?: number, options?: { type?: 'all' | 'archive' | 'highlight' | 'upload'; after?: string }): Promise<TwitchVideo[]>` (existing two-argument calls behave exactly as before).

- [ ] **Step 1: Write the failing tests.** `getFollowerDates`: stops at the first `followed_at` older than `sinceMs` and returns only the newer ones; follows the cursor across pages (`after` is sent); `total` comes from the first page; stops after `maxPages` and sets `reachedCap` only when a cursor remained and the last item was still newer than `sinceMs`; zero followers gives `{ dates: [], total: 0, reachedCap: false }`; a 401 rejects with `SessionExpiredError`. `getVideos`: without options the request has `user_id` and `first` only; with `{ type: 'archive', after: 'x' }` it also sends `type=archive` and `after=x`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** through `twitchApiFetch<{ data: { followed_at: string }[]; total: number; pagination?: { cursor?: string } }>('channels/followers', ...)`. Return the dates, never follower identities.
- [ ] **Step 4: Run** the new test and `src/lib/__tests__`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: followers-by-date call and getVideos filters`.

### Task 13: History bucketing (pure)

**Files:**
- Create: `src/lib/twitchDuration.ts`, `src/lib/historyStats.ts`
- Modify: `src/hooks/useDerivedStats.ts` (import `parseTwitchDuration` from the new file instead of defining it)
- Test: `src/lib/__tests__/twitchDuration.test.ts`, `src/lib/__tests__/historyStats.test.ts`

**Interfaces:**
- Produces: `parseTwitchDuration(duration: string): number` (hours; moved, behaviour identical); `interface DayBucket { day: string; at: number; value: number | null }` (`at` is the local-midnight timestamp); `localDayKey(ms: number): string` (local `YYYY-MM-DD`); `bucketFollowersByDay(dates: string[], now: number, days?: number, coveredFromMs?: number): DayBucket[]`; `bucketHoursByDay(videos: TwitchVideo[], now: number, days?: number): DayBucket[]`; `viewsPerBroadcast(videos: TwitchVideo[], now: number, days?: number): { at: number; value: number }[]`; `coverageDays(videos: TwitchVideo[], now: number): number | null`. `days` defaults to 30; buckets run oldest to newest and include today.

- [ ] **Step 1: Write the failing tests.** `parseTwitchDuration`: `'1h2m3s'`, `'45m'`, `'30s'`, `''` (the existing `useDerivedStats` tests must still pass). `bucketFollowersByDay`: counts per local day, `0` for an empty day inside the covered span, a follow just before and just after local midnight lands on different days, and days entirely before `coveredFromMs` are `null` (not `0`). `bucketHoursByDay`: only `type === 'archive'`; a broadcast crossing midnight counts wholly for its start day; hours sum per day; days before the oldest archive's day are `null`, later empty days `0`; no archives at all gives all `null`. `viewsPerBroadcast`: archives inside the window only, ascending by `created_at` as `at`, two broadcasts on one day stay separate points. `coverageDays`: whole days from the oldest archive to `now`, `null` with no archives.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Build the bucket list from local-midnight timestamps; use `Date` local-time getters (no UTC maths).
- [ ] **Step 4: Run** the new tests and `src/hooks/__tests__/useDerivedStats.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: history bucketing for the 30-day charts`.

### Task 14: Streamer data hooks

**Files:**
- Create: `src/hooks/useStreamerNumbers.ts`, `src/hooks/useStreamerHistory.ts`
- Test: `src/hooks/__tests__/useStreamerNumbers.test.tsx`, `src/hooks/__tests__/useStreamerHistory.test.tsx`

**Interfaces:**
- Consumes: `getBroadcasterFollowerCount`, `getBroadcasterSubscriptions(id, 1)` (reads `.total`), `getFollowerDates`, `getVideos` (Task 12), `historyStats` (Task 13).
- Produces: `interface Section<T> { data: T | null; loading: boolean; error: string | null }` (every `data` object also carries `source: 'twitch'`, so a later stored-history source can be told apart); `useStreamerNumbers(broadcasterId: string | null, onSessionExpired: () => void): { followers: Section<number>; subscribers: Section<number> }`; `useStreamerHistory(broadcasterId: string | null, onSessionExpired: () => void): { followers: Section<{ buckets: DayBucket[]; total: number; reachedCap: boolean }>; videos: Section<{ views: { at: number; value: number }[]; hours: DayBucket[]; coverageDays: number | null }> }`; `clearHistoryCache(): void` (tests only).

- [ ] **Step 1: Write the failing tests.** Both hooks make no request for a `null` id. `useStreamerNumbers`: each section loads and fails on its own (a failing subscriptions call leaves followers intact); a `SessionExpiredError` in either calls `onSessionExpired`. `useStreamerHistory`: `followers` calls `getFollowerDates(id, now - 30 days, 10)` and passes `reachedCap` and the earliest covered time into `bucketFollowersByDay`; `videos` calls `getVideos(id, 100, { type: 'archive' })`; the two sections fail independently; a second mount for the same id inside 15 minutes makes **no** new requests (fake timers or an injected clock) and one after 16 minutes does; a `SessionExpiredError` (including a missing-scope 401) calls `onSessionExpired`; nothing refetches while the hook stays mounted.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Module-level `Map<string, { at: number; value: ... }>` for the history cache, keyed by id and section.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: streamer number and 30-day history hooks`.

### Task 15: Chart geometry, charts, streamer row and panels

**Files:**
- Modify: `src/index.css` (streamer tokens: `--streamer-box`, `--streamer-border`, `--streamer-text`, `--streamer-label`, taken from the mockups' amber family but each text token checked to 4.5:1 on its box), `src/__tests__/contrast.test.ts` (add the new pairs following its existing pattern)
- Create: `src/lib/chartGeometry.ts`, `src/components/dashboard/BarChart.tsx`, `LineChart.tsx`, `StreamerRow.tsx`, `ThirtyDayPanels.tsx`
- Test: `src/lib/__tests__/chartGeometry.test.ts`, `src/components/dashboard/__tests__/BarChart.test.tsx`, `StreamerRow.test.tsx`, `ThirtyDayPanels.test.tsx`

**Interfaces:**
- Produces: `barHeights(values: (number | null)[], maxPx: number): (number | null)[]` (`null` stays `null`; `0` becomes a thin 2px stub; others scale to the max); `linePoints(points: { at: number; value: number }[], from: number, to: number, width: number, height: number): string` (SVG `points` string); `BarChart({ buckets: DayBucket[]; ariaLabel: string })` (a `null` bucket draws no bar, a `0` bucket a grey stub); `LineChart({ points: { at: number; value: number }[]; from: number; to: number; ariaLabel: string })`; `StreamerRow({ followers: number | null; subscribers: number | null; tracker: TrackerSummary | null; trackerLoading: boolean; login: string })`; `ThirtyDayPanels({ followers: Section<...>; videos: Section<...>; tracker: TrackerSummary | null; now: number })` (types from Task 14).

- [ ] **Step 1: Write the failing tests.** `barHeights` and `linePoints` cases including all-zero, a single point and empty input (no NaN in the output). `BarChart`: `role="img"` with the given `aria-label`; `null` buckets render no bar element. `StreamerRow`: chips in this order: `Rank` (first, `#18,402`), `Followers`, `Subscribers`, `Avg viewers`, `Peak viewers`, `Hours streamed` (`41h`, `41.5h`), `Hours watched` (`3.5k`), `Followers gained` (`+96`, `-12`, `+0`); every TwitchTracker chip carries the text `TT` and a title `TwitchTracker, last 30 days`; with `tracker` null the TT chips show `–` (not `0`) and the Twitch chips still show; the row header says figures marked TT come from twitchtracker.com and links `https://twitchtracker.com/<login>`; while `trackerLoading` the chip boxes render with `…` (same labels, so the height is reserved). `ThirtyDayPanels`: Followers big number is `+96` with the `TT` tag from `tracker.followersGained`, and without TwitchTracker it falls back to the sum of the bars **without** a `TT` tag; Time streamed likewise from `minutesStreamed / 60` or the bars' sum; Views per stream shows `14 streams` and the caption that recordings keep gaining views; the caption `recordings go back 9 days` appears when `coverageDays < 30`; when the followers call hit its cap the caption says the bars cover only the span reached; no archives at all shows an empty-state line, not a flat chart; each chart has an `aria-label` stating the figure and span; a section error shows `–` and its own small message while the others render.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** hand-written SVG and the markup from `dashboard-v4-history.html` and `dashboard-v5-30days.html`, using the new tokens. No chart library.
- [ ] **Step 4: Run** the new tests and `src/__tests__/contrast.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: streamer stat row and 30-day panels`.

### Task 16: Wire the streamer row in, and verify

**Files:**
- Modify: `src/components/dashboard/TwitchDashboard.tsx`
- Test: extend `src/components/dashboard/__tests__/TwitchDashboard.test.tsx`

**Interfaces:** Consumes Tasks 11, 14, 15 and `useSessionExpiry` (Task 9).

- [ ] **Step 1: Write the failing tests** (mock the three data hooks): a non-streamer (`broadcaster_type: ''`) renders no streamer row and no panels and makes no TwitchTracker or streamer-history request; `affiliate` and `partner` render the row and the panels between the chips and the wall; the tracker hook is given the signed-in `login` only for a streamer; with TwitchTracker returning `null` the Twitch-sourced chips and the bar charts still render; a streamer-call `onSessionExpired` is the one from `useSessionExpiry`, so a 401 signs the viewer out (assert `TOKEN_EXPIRED` and the expired signed-out card through `ProtocolPage`); the profile-null state still never shows or hides the streamer row.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the composition and the gate (`broadcaster_type === 'affiliate' || 'partner'`).
- [ ] **Step 4: Run the full verification.** Whole suite `--maxWorkers=2`; `tsc -b`; `eslint .`; `npm run build`; `git diff main -- package.json package-lock.json` is empty (no new dependency). Expected: all green, no new warnings.
- [ ] **Step 5: Manual check** in the built-in browser as in Task 10 with a streamer profile and mocked Twitch and TwitchTracker responses: row, three panels, the `{}` case (`–` chips), TwitchTracker blocked, a 401 mid-session; 1100px and 375px; reset the viewport. Confirm the spec's "Done means" list, item by item.
- [ ] **Step 6: Commit** `feat: streamer row and 30-day charts on the dashboard`, push, open **PR 2** (description ends with the `Co-Authored-By` attribution lines).
