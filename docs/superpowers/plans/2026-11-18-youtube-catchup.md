# YouTube Catch up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/youtube/catchup` page that blends new subscription uploads, pasted Watch Later ids and Mix-based related videos into one queue (2 S : 1 W : 1 R) that plays in PRISM's existing YouTube player.

**Architecture:** Pure logic (id parsing, blend) in `src/lib/catchup.ts`; localStorage state in `catchupStore.ts`; Data API calls in `catchupApi.ts`; one-time Google token in `googleYoutubeAuth.ts`; Mix reader in `mixRelated.ts`; a `useCatchup` hook assembles the lanes; `YoutubeCatchupPage` renders them. Browser-only, no server.

**Tech Stack:** Vite 6, React 19, TypeScript, Tailwind v4, vitest + jsdom, Google Identity Services token client, YouTube Data API v3 + IFrame Player API.

**Spec:** `docs/superpowers/specs/2026-11-18-youtube-catchup-design.md`. Reference code (throwaway, on branch `spike/youtube-playlist-lab`): `src/lib/ytLab.ts`, `src/lib/ytIframeApi.ts`, `src/lib/__tests__/ytLab.test.ts`. Port from it by copying the helper, not by merging the branch.

## Global Constraints

- Branch `feat/youtube-catchup` cut from `main`; the spike branch is never merged. Commit early; ship by PR, never to `main` directly.
- Commit messages carry NO Co-Authored-By line (owner rule: attribution goes in the PR description only).
- Env vars are `VITE_`-prefixed (`VITE_YOUTUBE_API_KEY` exists; this plan adds `VITE_GOOGLE_CLIENT_ID`).
- Use `var(--accent-youtube)` for the YouTube accent; match existing page patterns (see `YoutubePlayerPage.tsx`).
- localStorage keys are added to `src/config/storageKeys.ts` with the `prism_` prefix; every read/write is wrapped in try/catch (private mode, quota).
- Auth token is used once, in memory, and discarded: never stored.
- Lane mix is exactly 2 S : 1 W : 1 R, a dry lane skipped, duplicates dropped.
- Spec's embed facts: `LL`/`WL` do not play as playlist ids; a Mix can answer with nothing (8s notice).
- Windows: forward slashes, bash syntax. If a vitest suite fails to load with `UNKNOWN ... aria-query`, re-run first.

## Review Focus

- A subscribed channel that is terminated or has a missing uploads playlist (API 404): skip that channel, the rest of the feed still loads.
- Zero subscriptions imported / API key missing / quota exceeded (403): page shows a plain message and whatever lanes still work, never a blank page.
- Google popup closed or access denied: back to the "Import" button with a short notice, stored subscriptions untouched.
- More than 50 subscriptions: paging through `nextPageToken` imports all of them, not the first page.
- Videos that cannot be played (`embeddable` false, or `durationSec` 0 = live/upcoming): never reach the queue.

---

### Task 1: Branch and pure core

**Files:**
- Create: `src/lib/catchup.ts`, `src/lib/__tests__/catchup.test.ts`
- Docs carried over from the spike branch: `docs/superpowers/specs/2026-11-18-youtube-catchup-design.md`, `docs/superpowers/plans/2026-11-18-youtube-catchup.md`

**Interfaces:**
- Produces:
  - `type Lane = 'S' | 'W' | 'R'`
  - `interface CatchupVideo { id: string; title: string; channel: string; publishedAt: string; durationSec: number; thumbnail: string; tag?: Lane }`
  - `uploadsPlaylistId(channelId: string): string | null` (`UC…` becomes `UU…`; anything not matching `^UC[\w-]{22}$` returns null)
  - `parseVideoIds(text: string): string[]` (ported unchanged from `ytLab.ts`, with its helper `parseVideoId`; deduped, in order)
  - `parseDuration(iso: string): number`, `formatDuration(sec: number): string` (ported unchanged)
  - `blend(subs: CatchupVideo[], later: CatchupVideo[], related: CatchupVideo[]): CatchupVideo[]` (ported unchanged apart from the type)

- [ ] **Step 1:** `git switch -c feat/youtube-catchup main`, then `git checkout spike/youtube-playlist-lab -- docs/superpowers/specs/2026-11-18-youtube-catchup-design.md docs/superpowers/plans/2026-11-18-youtube-catchup.md`.
- [ ] **Step 2: Write the failing tests** in `catchup.test.ts`: port the `ytLab.test.ts` cases for `parseVideoId`/`parseVideoIds`, `parseDuration`/`formatDuration` and both `blend` cases (expected order `s1,s2,w1,r1,s3,s4,r2`, tags `SSWRSSR`; dedupe case `a,b,c`), then add: `uploadsPlaylistId('UCabcdefghijklmnopqrstuv') === 'UUabcdefghijklmnopqrstuv'`, `uploadsPlaylistId('nope') === null`, `uploadsPlaylistId('UUabcdefghijklmnopqrstuv') === null`.
- [ ] **Step 3:** Run `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/catchup.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement `src/lib/catchup.ts`** with the signatures above, copying the bodies from `ytLab.ts` (no `parseListId`, no API code).
- [ ] **Step 5:** Re-run the test. Expected: all PASS.
- [ ] **Step 6:** Commit `feat(catchup): pure core (blend, id parsing, uploads playlist id)` including the two docs.

### Task 2: Local store

**Files:**
- Modify: `src/config/storageKeys.ts` (add `LOCAL_CATCHUP_SUBSCRIPTIONS: 'prism_catchup_subscriptions'`, `LOCAL_CATCHUP_WATCH_LATER: 'prism_catchup_watch_later'`, `LOCAL_CATCHUP_WATCHED: 'prism_catchup_watched'`, `LOCAL_CATCHUP_LANE_CACHE: 'prism_catchup_lane_s'`)
- Create: `src/lib/catchupStore.ts`, `src/lib/__tests__/catchupStore.test.ts`

**Interfaces:**
- Consumes: `STORAGE_KEYS`, `logger`.
- Produces:
  - `interface StoredChannel { id: string; title: string }`
  - `getSubscriptions(): StoredChannel[]`, `setSubscriptions(list: StoredChannel[]): void` (setting clears the S-lane cache)
  - `getWatchLater(): string[]`, `setWatchLater(ids: string[]): void`
  - `recordWatched(videoId: string): void` (newest first, deduped, capped at 10), `getWatchedSeeds(n = 3): string[]`
  - `readSLaneCache(now = Date.now()): CatchupVideo[] | null` and `writeSLaneCache(videos: CatchupVideo[], now = Date.now()): void`, TTL 30 minutes

- [ ] **Step 1: Write failing tests:** round-trips for subscriptions and watch later; corrupt JSON in storage returns `[]`; `recordWatched` ordering, dedupe and cap at 10 (`getWatchedSeeds(3)` returns the newest three); S-lane cache returns data at +29 min and `null` at +31 min; `setSubscriptions` empties the cache; a `localStorage.setItem` that throws does not propagate.
- [ ] **Step 2:** Run the test file, expect FAIL.
- [ ] **Step 3: Implement** `catchupStore.ts`, every access in try/catch returning the empty value.
- [ ] **Step 4:** Run, expect PASS. Commit `feat(catchup): local store`.

### Task 3: Data API client

**Files:**
- Create: `src/lib/catchupApi.ts`, `src/lib/__tests__/catchupApi.test.ts`

**Interfaces:**
- Consumes: `CatchupVideo`, `uploadsPlaylistId`, `parseDuration`, `StoredChannel`, `readSLaneCache`/`writeSLaneCache`.
- Produces:
  - `class CatchupApiError extends Error { status: number }`
  - `listSubscriptions(accessToken: string): Promise<StoredChannel[]>`: `GET subscriptions?part=snippet&mine=true&maxResults=50` with header `Authorization: Bearer <token>`, follows `nextPageToken` to the end; channel id is `snippet.resourceId.channelId`.
  - `describeVideos(ids: string[]): Promise<CatchupVideo[]>`: `videos?part=snippet,contentDetails,status` in batches of 50 with the API key; keeps the caller's order; drops `status.embeddable === false` and `durationSec === 0`; thumbnail is `snippet.thumbnails.medium.url`, falling back to `default`, then `''`.
  - `fetchSubscriptionLane(channels: StoredChannel[], opts?: { perChannel?: number; cap?: number }): Promise<CatchupVideo[]>`: defaults `perChannel = 5`, `cap = 100`; reads `readSLaneCache()` first and returns it on a hit; otherwise `playlistItems?part=contentDetails&maxResults=<perChannel>` for each channel's uploads playlist, at most 6 requests in flight; a channel whose request fails with 404 or any non-quota error is skipped; a 403 with reason `quotaExceeded` throws `CatchupApiError` (status 403); ids are described, sorted by `publishedAt` descending, cut to `cap`, written to the cache, returned.

- [ ] **Step 1: Write failing tests** with `vi.stubGlobal('fetch', …)`: `listSubscriptions` follows two pages (51 channels in total); `describeVideos` drops a non-embeddable video and a `P0D` video, keeps order, and makes two requests for 51 ids; `fetchSubscriptionLane` skips a channel whose playlist call returns 404 while the others return; sorts newest first; caps at `cap`; returns the cached lane without calling `fetch` when the cache is warm; throws `CatchupApiError` with status 403 when a response body has `error.errors[0].reason === 'quotaExceeded'`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.** One private `call(path, params, token?)` helper (as in `ytLab.ts`); a small promise-pool for the concurrency of 6.
- [ ] **Step 4:** Run, expect PASS. Commit `feat(catchup): data API client`.

### Task 4: One-time Google sign-in

**Files:**
- Create: `src/lib/googleYoutubeAuth.ts`, `src/lib/__tests__/googleYoutubeAuth.test.ts`
- Modify: `.env.example` (add `VITE_GOOGLE_CLIENT_ID=` with a comment: OAuth client of type Web, origins `http://localhost:5000` and `https://prism.nooroticx.tv`, consent screen in Testing with the owner as test user, scope `youtube.readonly`)

**Interfaces:**
- Produces:
  - `isGoogleAuthConfigured(): boolean` (true when `VITE_GOOGLE_CLIENT_ID` is non-empty)
  - `requestYoutubeReadToken(): Promise<string>`: loads `https://accounts.google.com/gsi/client` once, calls `google.accounts.oauth2.initTokenClient({ client_id, scope: 'https://www.googleapis.com/auth/youtube.readonly', callback, error_callback })`, then `requestAccessToken({ prompt: '' })`; resolves with `access_token`; rejects `GoogleAuthError` (`reason: 'denied' | 'closed' | 'unconfigured' | 'load'`) for a callback response carrying `error`, an `error_callback` of type `popup_closed`, a missing client id, or a script load failure.

- [ ] **Step 1: Write failing tests** with a stubbed `window.google.accounts.oauth2.initTokenClient` that captures the config: resolves with the token; maps an `error: 'access_denied'` response to reason `denied`; maps `error_callback({ type: 'popup_closed' })` to `closed`; rejects `unconfigured` when no client id (stub `import.meta.env` with `vi.stubEnv`).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement**, injecting the script tag once (the same single-flight pattern as the spike's `loadYouTubeIframeApi`). Add minimal local `declare global` types for `window.google`; no `@types` package.
- [ ] **Step 4:** Run, expect PASS. Commit `feat(catchup): one-time Google read-only token`.

### Task 5: Related lane (Mix reader)

**Files:**
- Create: `src/lib/ytIframeApi.ts` (copy from the spike branch: `git show spike/youtube-playlist-lab:src/lib/ytIframeApi.ts`, drop the `SPIKE` comment, add `cuePlaylist(o: { list?: string; listType?: 'playlist' }): void` and `pauseVideo(): void` to `YTPlayer`), `src/lib/mixRelated.ts`, `src/lib/__tests__/mixRelated.test.ts`

**Interfaces:**
- Consumes: `loadYouTubeIframeApi`, `YTPlayer`, `describeVideos`.
- Produces:
  - `fetchMixIds(seedVideoId: string, timeoutMs = 8000): Promise<string[]>`: creates an offscreen muted player, asks for `RD<seed>`, polls `getPlaylist()` every 250 ms until it holds more than one id, then destroys the player and its element; resolves `[]` on timeout; the seed itself is removed from the result.
  - `fetchRelatedLane(seeds: string[]): Promise<CatchupVideo[]>`: tries each seed in order, takes the first Mix with at least 10 ids, describes up to 50 of them with `describeVideos`; `[]` if no seed answers.

- [ ] **Step 1: Write failing tests** with a fake `window.YT` whose player answers `getPlaylist()` after N polls (use fake timers): returns ids minus the seed; returns `[]` after the timeout and calls `destroy()`; `fetchRelatedLane` moves on to the second seed when the first Mix is empty (mock `describeVideos`).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.** Use `cuePlaylist` so the hidden player does not play. UNVERIFIED: whether `getPlaylist()` fills after a cue; if the manual check in Step 5 shows it does not, switch to `loadPlaylist` followed immediately by `pauseVideo()` and record that finding in the file header.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5 (manual):** `preview_start prism-dev`; in the browser console on any page run `await import('/src/lib/mixRelated.ts').then(m => m.fetchMixIds('<a video id the owner watched>'))`. Expected: array of 50 to 100 ids, and no new entry in the owner's YouTube History for the seed (ask the owner to look). Record the result.
- [ ] **Step 6:** Commit `feat(catchup): related lane from a hidden Mix player`.

### Task 6: `useCatchup` hook

**Files:**
- Create: `src/hooks/useCatchup.ts`, `src/hooks/__tests__/useCatchup.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces `useCatchup(): CatchupState` where
  `interface CatchupState { queue: CatchupVideo[]; status: 'idle' | 'loading' | 'ready'; notices: string[]; subscriptionCount: number; watchLaterCount: number; importSubscriptions(): Promise<void>; savePastedWatchLater(text: string): Promise<void>; refresh(): Promise<void> }`

Behaviour: on mount (and `refresh`) loads the three lanes in parallel with `Promise.allSettled`. S lane from `fetchSubscriptionLane(getSubscriptions())`; W lane from `describeVideos(getWatchLater())`; R lane from `fetchRelatedLane(getWatchedSeeds())`. A rejected lane adds one plain-language entry to `notices` ("Subscriptions: YouTube quota used up for today", "Related: no suggestions came back for your recent videos", etc.) and contributes `[]`. `queue = blend(S, W, R)`. `importSubscriptions` = `requestYoutubeReadToken()` then `listSubscriptions` then `setSubscriptions` then `refresh`; a `GoogleAuthError` adds a notice and leaves the store alone. `savePastedWatchLater(text)` = `setWatchLater(parseVideoIds(text))` then `refresh`.

- [ ] **Step 1: Write failing tests** (mock the lib modules): queue is blended 2:1:1 with tags; a rejecting S lane yields a notice and a queue of W and R only; `importSubscriptions` with a denied token leaves `getSubscriptions()` unchanged and adds a notice; `savePastedWatchLater` stores parsed ids.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run, expect PASS. **Step 5:** Commit `feat(catchup): useCatchup hook`.

### Task 7: Page, route, entry points

**Files:**
- Create: `src/pages/YoutubeCatchupPage.tsx`, `src/components/youtube/CatchupCard.tsx`, `src/pages/__tests__/YoutubeCatchupPage.test.tsx`
- Modify: `src/AppRoutes.tsx` (add `<Route path="youtube/catchup" element={<YoutubeCatchupPage />} />` beside the `youtube` routes; update `src/__tests__` route-table test if one lists routes), `src/pages/ProtocolPage.tsx` (a "Catch up" link on the YouTube view), `src/pages/YoutubePlayerPage.tsx` (call `recordWatched(videoId)` once per `videoId` in the effect that sets the player URL)

**Interfaces:**
- Consumes: `useCatchup`, `formatDuration`, `isGoogleAuthConfigured`.
- `CatchupCard({ video }: { video: CatchupVideo })`: thumbnail, title, channel, `formatDuration`, a lane chip (S/W/R with a title attribute: "New from your subscriptions" / "From your Watch Later" / "Related to what you watched"); the whole card links to `/youtube/${video.id}`.

Page layout: heading "Catch up" in `var(--accent-youtube)`; a status line (`N subscriptions, M Watch Later videos`); "Import my subscriptions" button (disabled with an explanation when `!isGoogleAuthConfigured()`); "Refresh"; a Watch Later box (an "Open Watch Later on YouTube" link to `https://www.youtube.com/playlist?list=WL` and a textarea plus "Save pasted videos"); lane filter chips (All / S / W / R, local state only); the card grid; `notices` shown above the grid; an empty-state message when the queue is empty and status is `ready`.

- [ ] **Step 1: Write failing tests** (mock `useCatchup`): renders cards with lane chips and links to `/youtube/<id>`; the S chip filters the grid to S cards; notices render; the empty state renders; the import button is disabled with the explanation when the client id is missing; pasting text and pressing save calls `savePastedWatchLater` with the text.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Run the page tests plus the route-table test, expect PASS.
- [ ] **Step 5:** Commit `feat(catchup): Catch up page and routes`.

### Task 8: Verify and document

- [ ] **Step 1:** `node ./node_modules/vitest/vitest.mjs run` (full suite) and `node ./node_modules/typescript/bin/tsc -b --noEmit` (or the project's `pnpm build`). Expected: green, no type errors.
- [ ] **Step 2 (manual, owner's browser):** the owner puts a Web OAuth client id in `.env` as `VITE_GOOGLE_CLIENT_ID` (consent screen in Testing, owner as test user), restarts `prism-dev`, opens `/youtube/catchup`, imports subscriptions, plays one S card, then confirms the video appears in their real YouTube History and the Related lane gains cards after a few watches. Report what was and was not seen.
- [ ] **Step 3:** Add one line for `src/pages/YoutubeCatchupPage.tsx` / `src/lib/catchup*.ts` / `googleYoutubeAuth.ts` / `mixRelated.ts` to the Key Files list in `CLAUDE.md`; update the project memory entry.
- [ ] **Step 4:** Commit `docs: Catch up in CLAUDE.md`, push `feat/youtube-catchup`, open the PR (description ends with the Claude Code attribution line; the Co-Authored-By line goes there, not in commits).

## Self-review notes

- Spec coverage: import (Task 4, 3, 6), S lane with quota-aware cache (3), R lane with 8s no-response (5), W paste route and link-out (7), blend and lane tags (1, 7), reuse of the existing player and History (7, existing page), env and consent-screen step (4, 8).
- My calls (not in the spec): per-channel 5 videos, lane cap 100, 30 minute cache, last 3 watched videos as Mix seeds, last 10 watched kept, live and upcoming videos (`durationSec` 0) excluded, cue-not-load for the hidden player pending Task 5 Step 5.
- Left out on purpose (YAGNI): a bookmarklet for Watch Later (the paste box is enough to start), per-channel mute, infinite scroll.
