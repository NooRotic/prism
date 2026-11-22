# YouTube Rail Automatic First Check + Live Pick-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rail's YouTube section checks live once per visit on its own, and the YouTube player page adds a live stream to (or drops an ended one from) the rail's list for free.

**Architecture:** The rail's stored last answer moves out of `useYoutubeLive` into a tiny store module that announces changes (same tab: a window event; other tabs: `storage`). A pure function applies "this video is live / not live" to the stored answer. The player page's existing 1-unit `videos.list` gains `liveStreamingDetails` and stops caching live or upcoming videos, so their state is read fresh.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library. Run tests with `node ./node_modules/vitest/vitest.mjs run <path>` (rtk rewrites `npx`).

**Spec:** `docs/superpowers/specs/2026-11-22-youtube-rail-auto-check-design.md`

## Global Constraints

- The automatic check runs at most once per tab (`sessionStorage`), only when `checkAllowed().ok` and the quota is not reached, and it is counted with `recordCheck()` like a click.
- No timers that fetch, no background polling. The only new API spend is none: the player page's call is the same 1 unit.
- A stream is only ever added for a channel in `getSubscriptions()`.
- A player-page update never changes `checkedAt` and never calls `recordCheck()`.
- Every storage read/write is wrapped in try/catch (the existing pattern); nothing new throws.

## Review Focus

- **Rail mounted before subscriptions finish importing** (`available` false on first render, true later): the automatic check must fire when `available` becomes true in that tab, still only once. Test in Task 2.
- **A cached video page for a stream that has since ended:** a live video must not be served from the 24 h cache, or it would stay "live" all day. Test in Task 3.
- **Two PRISM tabs:** a stream added by the player page in tab B shows in tab A's rail (via `storage`). Test in Task 1.
- **Player page for a live video whose channel is already in the list with a different (older) videoId:** the entry is replaced, not duplicated (one entry per channel). Test in Task 1.
- **No last answer yet (never checked) and the player page sees a live subscribed stream:** a store is created with `checkedAt: null`-safe handling; the rail shows the stream and its status line does not claim a check happened. Store behaviour tested in Task 1; the rail's view of it in Task 2 (`checkedAt` stays null, `streams` has the entry, `status` is not `'ok'` from a check).

---

### Task 1: Live store + pure update

**Files:**
- Create: `src/lib/youtubeLiveStore.ts`
- Test: `src/lib/__tests__/youtubeLiveStore.test.ts`

**Interfaces:**
- Consumes: `LiveStream` from `src/lib/youtubeLive.ts`; `STORAGE_KEYS.LOCAL_YOUTUBE_LIVE_LAST`; `StoredChannel` from `catchupStore`.
- Produces:
  - `interface LiveLast { checkedAt: number | null; streams: LiveStream[] }` (`checkedAt` null = nothing has run a check yet, only player-page sightings)
  - `readLiveLast(): LiveLast | null` (accepts the old shape `{checkedAt:number, streams}`; damaged → null)
  - `writeLiveLast(last: LiveLast): void` — writes, then `window.dispatchEvent(new Event(LIVE_LAST_CHANGED))`
  - `const LIVE_LAST_CHANGED = 'prism:youtube-live-changed'`
  - `subscribeLiveLast(cb: () => void): () => void` — listens to `LIVE_LAST_CHANGED` and to `storage` events whose key is `LOCAL_YOUTUBE_LIVE_LAST`
  - `type VideoLiveSighting = { videoId: string; channelId: string; channelTitle: string; title: string; isLive: boolean; viewerCount: number | null; startedAt: string | null }`
  - `applySighting(last: LiveLast | null, s: VideoLiveSighting, subscriptions: StoredChannel[]): LiveLast | null` — pure; returns `null` when nothing changes

- [ ] **Step 1: Write the failing tests** — `applySighting`:
  - live + subscribed + not in list → added; `checkedAt` unchanged (`null` stays `null`); `avatarUrl: ''`, `channelTitle` from the subscription title.
  - live + subscribed + same channel with another videoId → that entry replaced, list length unchanged.
  - live + already listed with same videoId → viewerCount/startedAt refreshed, `avatarUrl` kept from the old entry.
  - not live + listed by videoId → removed.
  - not live + not listed → returns `null`.
  - live + NOT subscribed → returns `null`.
  - Store: `writeLiveLast` then `readLiveLast` round-trips; `subscribeLiveLast` callback fires on `writeLiveLast` and on a `StorageEvent` with key `prism_youtube_live_last`, not on other keys; `readLiveLast` returns null for `'{bad'`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/youtubeLiveStore.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module with the signatures above. Match entries by `channelId` for "live" and by `videoId` for "not live".
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/lib/youtubeLiveStore.ts src/lib/__tests__/youtubeLiveStore.test.ts && git commit -m "feat(youtube): live-answer store with change events and pure sighting update"`

### Task 2: `useYoutubeLive` — store-backed, automatic once per visit

**Files:**
- Modify: `src/hooks/useYoutubeLive.ts` (drop its private `readLast`/`writeLast`; use Task 1's store; doc comment no longer says "nothing runs on mount")
- Modify: `src/config/storageKeys.ts` — add `SESSION_YOUTUBE_LIVE_AUTO: 'prism_youtube_live_auto'`
- Test: `src/hooks/__tests__/useYoutubeLive.test.tsx`

**Interfaces:**
- Consumes: Task 1 `readLiveLast`, `writeLiveLast`, `subscribeLiveLast`, `LiveLast`.
- Produces: same return shape as today (`checkedAt: number | null` already allows null), so `YoutubeRailSection` needs no change.

- [ ] **Step 1: Update/write the failing tests:**
  - REPLACE "does nothing until the viewer asks: nothing is fetched on mount" with `checks automatically once on the first mount of a visit` → `fetchLiveSubscriptions` called once; `sessionStorage['prism_youtube_live_auto']` set.
  - `a remount in the same tab (a reload) does not check again` → unmount, render again, still 1 call.
  - `the automatic check waits for subscriptions`: render with none → 0 calls; `setSubscriptions(subs)` + whatever makes `useYoutubeAccount` re-read (follow the existing tests' pattern) → 1 call.
  - `the automatic check obeys the allowance`: `recordCheck()` first → 0 calls, and the marker is set (it does not retry later in this visit).
  - `the automatic check is skipped when the quota is reached` (`markQuotaReached()`).
  - `the automatic check counts toward the five a day` → after it, `checkAllowed().ok === false` with reason `cooldown`.
  - `shows a stream another part of the page wrote to the store`: `writeLiveLast({checkedAt:null, streams:[stream]})` inside `act` → `result.current.streams` has it.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useYoutubeLive.test.tsx` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** State is `useSyncExternalStore`-style or `useState` + `subscribeLiveLast` re-read (either is fine). The automatic check is an effect on `available`: when true and the session marker is absent, set the marker FIRST, then call `check()`. The marker write is in try/catch; if `sessionStorage` throws, use a module-level flag. `check()` writes `{ checkedAt: Date.now(), streams }` through `writeLiveLast`.
- [ ] **Step 4: Run** the hook tests and `node ./node_modules/vitest/vitest.mjs run src/components/rail` — Expected: PASS (fix rail tests that assumed no fetch on mount by mocking as they already do; report any you can't).
- [ ] **Step 5: Commit** `git commit -am "feat(youtube): rail checks live once per visit on its own"` (add the storageKeys file).

### Task 3: Player page reports what it sees

**Files:**
- Modify: `src/lib/videoPageApi.ts` (`getVideoPage`, `VideoPageData`)
- Modify: `src/pages/YoutubePlayerPage.tsx` (one effect after `useVideoPage`)
- Test: `src/lib/__tests__/videoPageApi.test.ts`, `src/pages/__tests__/YoutubePlayerPage.test.tsx` (or the existing page test file; follow its mocks)

**Interfaces:**
- Consumes: Task 1 `applySighting`, `readLiveLast`, `writeLiveLast`, `VideoLiveSighting`; `getSubscriptions()`.
- Produces: `VideoPageData.live: { state: 'live' | 'upcoming' | 'none'; viewerCount: number | null; startedAt: string | null }`

- [ ] **Step 1: Write the failing tests:**
  - `getVideoPage` requests `part=snippet,statistics,topicDetails,liveStreamingDetails` (still ONE call).
  - live answer → `live.state === 'live'`, `viewerCount` a number from `concurrentViewers`, `startedAt` from `actualStartTime`.
  - a live (and an upcoming) video is NOT cached: two calls to `getVideoPage('x')` make two fetches; a `none` video is still cached (second call makes no fetch).
  - a cached entry from before this change (no `live` field) is treated as `state: 'none'`.
  - Page: with a live subscribed video, after load `readLiveLast()!.streams` contains it; with `state: 'none'` for a videoId in the store, it is removed; with `upcoming`, the store is untouched.
- [ ] **Step 2: Run** both test files — Expected: FAIL.
- [ ] **Step 3: Implement.** In the page, one `useEffect` on `data`: skip when `data` is null or `live.state === 'upcoming'`; build a `VideoLiveSighting` (`isLive: state === 'live'`); `const next = applySighting(readLiveLast(), sighting, getSubscriptions()); if (next) writeLiveLast(next)`.
- [ ] **Step 4: Run** both files plus `node ./node_modules/vitest/vitest.mjs run src/pages src/lib` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(youtube): opening a live video adds it to the rail, an ended one drops off"`

### Task 4: Verify and ship

- [ ] **Step 1:** `pnpm run typecheck` (or `pnpm exec tsc -b`) and `pnpm run lint` — Expected: clean.
- [ ] **Step 2:** Full suite `node ./node_modules/vitest/vitest.mjs run` — Expected: all pass (re-run once if a suite fails with `UNKNOWN ... aria-query`, a known Windows flake).
- [ ] **Step 3:** Browser check on the dev server (`preview_start`): seed `prism_catchup_subscriptions` (see the reference memory on driving state without a login), load once → one `playlistItems` burst in network requests; reload → none.
- [ ] **Step 4:** Update CLAUDE.md's rail/YouTube line (`youtubeLiveStore.ts`, automatic once per visit, player-page pick-up). Commit, push branch, open PR (description ends with the Claude Code line; Co-Authored-By only in the PR, never in commits).
