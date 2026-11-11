# Channel page offline layout and stats slot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/twitch/<channel>`, a signed-in viewer of an offline channel gets the player folded to a strip, chat as a tall pinned column (wide window) or a full-width resizable block (thin window), and a stats slot between the profile and the four cards.

**Architecture:** `TwitchPlayerPage` picks between today's `ChatDock` layout and a new `OfflineLayout` (one CSS grid, the chat is a single element placed by `lg:` classes so C and A never reload it). The lower page sections move into a shared `ChannelBody` that also holds the new `ChannelStatsSlot`. The streamer hooks and block are extracted from `TwitchDashboard` so both pages share them. A once-a-minute poll writes live status into shared state through one new reducer action.

**Tech Stack:** Vite 6, React 19, TypeScript, Tailwind CSS v4 (container queries are built in), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-11-channel-page-offline-layout-design.md` (approved by the owner 2026-11-11). Read it first; this plan only records the decisions the spec leaves to the builder.

## Global Constraints

- Branch `feat/channel-page-offline-layout`; ship by PR, never direct to main. Commit messages carry NO Co-Authored-By line (the PR description does).
- No new runtime dependency; `package.json` and `package-lock.json` unchanged.
- Offline layout only when: signed in AND `state.channel.profile.login` equals the route channel (case-insensitive) AND `state.channel.isLive` is false. Signed out, loading, load error and live all keep today's layout.
- Wide layout C from `lg` (1024px) up; below it layout A. The chat is on the RIGHT in C whatever dock side is remembered.
- Live poll: 60 000 ms, only while `document.visibilityState === 'visible'`, only while the offline layout is shown.
- Chat width storage key `LOCAL_CHAT_OFFLINE_WIDTH: 'prism_chat_offline_width'`; default 360px, min 280px, max the smaller of 560px and half the container.
- Layout A height is remembered under the existing `LOCAL_CHAT_FLOAT_HEIGHT`.
- The chat iframe must never reload on a C<->A change (one element, CSS only). One reload when an offline channel finishes loading and one at go-live are accepted by the owner.
- While folded, hidden chat controls: swap side, drag grip, Fill, Fullscreen, and the floating-video control. Kept: text size, hide, pop out.
- Run tests with `node ./node_modules/vitest/vitest.mjs run <paths> --maxWorkers=2 > <file> 2>&1` and read the file (the rtk wrapper truncates output and masks exit codes; check the artifact). Never start the dev server while the full suite runs.

## Review Focus

Failure modes the spec implies that most likely bite, each pinned by a test in the owning task:
1. Route change from one offline channel to another: stale `isLive`/profile must not fold the new channel, "Show player" must reset, the poll must restart for the new user id. (Tasks 2, 3)
2. A channel with no archive recordings: "last streamed" is omitted, nothing says "NaN" or "Invalid Date". (Tasks 1, 5)
3. A stored chat width or height from a bigger window, or garbage in storage: clamped or ignored. (Tasks 1, 6)
4. Chat hidden or popped out in C: the column collapses, the left column takes the full width, the restore strip works. (Task 6)
5. Poll failure, hidden tab, a response arriving after unmount or a channel change, and go-live while the viewer already unfolded the player (no double mount). (Tasks 2, 3, 7)

## File Structure

- Create `src/lib/offlineLayout.ts` — width clamp/storage, "last streamed" and "X ago" helpers.
- Create `src/hooks/useChannelLive.ts` — the poll.
- Create `src/hooks/useOfflineLayout.ts` — offline decision and fold state.
- Create `src/hooks/useStreamerStats.ts` — the three streamer hooks behind one gate (extracted from `TwitchDashboard`).
- Create `src/components/dashboard/StreamerBlock.tsx` — `StreamerRow` + `ThirtyDayPanels` as one block.
- Create `src/components/channel/ChannelStatsSlot.tsx`, `OfflineStrip.tsx`, `OfflineLayout.tsx`, `ChannelBody.tsx`.
- Modify `src/contexts/AppContext.tsx` (one action), `src/config/storageKeys.ts` (one key), `src/components/dashboard/TwitchDashboard.tsx` (use the extracted pieces), `src/components/chat/ChatHeader.tsx` and `ChatStrip.tsx` (a `fillControls` flag), `src/pages/TwitchPlayerPage.tsx`, and (Task 8) the class strings of `StatsRow`, `ClipGrid`, `VODGrid`, `ThirtyDayPanels`.
- Tests beside each file in `__tests__` folders. `TwitchPlayerPage.fill.test.tsx` mocks `useApp` with only `state.player`; it needs `channel`, `auth` and `loading` added (Task 7).

---

### Task 1: Pure helpers and the storage key

**Files:** Create `src/lib/offlineLayout.ts`, `src/lib/__tests__/offlineLayout.test.ts`. Modify `src/config/storageKeys.ts`.

**Interfaces:**
- Produces: `OFFLINE_CHAT_WIDTH_DEFAULT = 360`, `OFFLINE_CHAT_WIDTH_MIN = 280`, `OFFLINE_CHAT_WIDTH_MAX = 560`;
  `clampChatWidth(px: number, containerWidth: number): number` (rounded; min 280; max `min(560, floor(containerWidth / 2))`, but never below 280; a non-finite `px` gives the default);
  `loadChatWidth(): number` (default when missing, non-numeric, or outside 280..560; storage errors give the default);
  `storeChatWidth(px: number): void` (rounds; swallows storage errors);
  `lastStreamedAt(videos: TwitchVideo[]): number | null` (the end time in ms of the newest video with `type === 'archive'`: `created_at` plus `parseTwitchDuration(duration)` hours; null when there is no archive or its `created_at` is unreadable);
  `formatAgo(thenMs: number, now: number): string`.
- Consumes: `parseTwitchDuration` (`src/lib/twitchDuration.ts`, returns HOURS), `TwitchVideo`.

- [ ] **Step 1: Write the failing tests.** `clampChatWidth`: 200 on a 1400 container gives 280; 900 on 1400 gives 560; 700 on 800 gives 400 (half of 800); 380.4 gives 380; `NaN` gives 360. `loadChatWidth`: missing, `'abc'`, `'100'`, `'900'` give 360; `'420'` gives 420; a `getItem` that throws gives 360. `storeChatWidth(420.6)` then `loadChatWidth()` gives 421; a `setItem` that throws does not throw. `lastStreamedAt`: a highlight and an upload newer than an archive are ignored; two archives give the newer one's `created_at` + duration (`'2h30m0s'` adds 9 000 000 ms); no archive gives null; an archive with `created_at: 'nope'` gives null. `formatAgo`: 59 s gives "just now"; 60 s "1 minute ago"; 5 min "5 minutes ago"; 3 h "3 hours ago"; 36 h "1 day ago"; 3 d "3 days ago"; 15 d "2 weeks ago"; 70 d "2 months ago"; a `thenMs` in the future gives "just now".
- [ ] **Step 2: Run to verify it fails** (`offlineLayout.test.ts`). Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the signatures above in `src/lib/offlineLayout.ts` and add `LOCAL_CHAT_OFFLINE_WIDTH` to `STORAGE_KEYS`.
- [ ] **Step 4: Run to verify it passes.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: helpers for the offline chat width and the last-streamed line`.

### Task 2: Live-status poll

**Files:** Modify `src/contexts/AppContext.tsx`. Create `src/hooks/useChannelLive.ts`, `src/hooks/__tests__/useChannelLive.test.tsx`. Modify/extend the AppContext reducer tests (find the existing file beside `AppContext`).

**Interfaces:**
- Produces: reducer action `{ type: 'UPDATE_CHANNEL_STREAM'; stream: TwitchStream | null }`. It sets `channel.stream`, sets `channel.isLive = stream?.type === 'live'`, and when `channel.profile` is non-null and `displayMode` is `'streamer'` or `'chatter'` recomputes it with `channelDisplayMode(isLive, profile)`. With `channel.profile === null` or any other `displayMode` it leaves `displayMode` alone; with a null profile it changes nothing.
  `useChannelLive(options: { userId: string | null; enabled: boolean; onSessionExpired: () => void }): void`.
- Consumes: `getStreams(userId): Promise<TwitchStream | null>` (`src/lib/twitchApi.ts`), `SessionExpiredError`, `useApp().dispatch`.

- [ ] **Step 1: Write the failing tests.** Reducer: offline to live sets `isLive`, `stream`, and moves a `'chatter'` mode to `'streamer'`; live to null sets `isLive` false and keeps `'streamer'` for a partner profile; `'video'` and `'idle'` modes are untouched; a null profile changes nothing. Hook (fake timers, `getStreams` mocked): does nothing when `enabled` is false or `userId` is null; calls once after 60 000 ms and dispatches the result; does not call while `visibilityState` is `'hidden'`; calls immediately when the tab becomes visible; stops after unmount; a `SessionExpiredError` calls `onSessionExpired` and does not dispatch; any other error is ignored and the next tick polls again; a response that resolves after the user id changed or after unmount is dropped (no dispatch).
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL (action and hook missing).
- [ ] **Step 3: Implement** the action in the reducer and `useChannelLive` (an interval while enabled, a `visibilitychange` listener, a generation counter or `cancelled` flag for the stale guard).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** `feat: poll a channel's live status while its offline page is open`.

### Task 3: Offline decision and fold state

**Files:** Create `src/hooks/useOfflineLayout.ts`, `src/hooks/__tests__/useOfflineLayout.test.tsx`.

**Interfaces:**
- Produces: `useOfflineLayout(channel: string | undefined): { offline: boolean; folded: boolean; showPlayer: () => void }`.
  `offline` follows the Global Constraints rule. `folded` is `offline` and not unfolded. Unfolded becomes true on `showPlayer()` and automatically when `state.player.detection` is a clip (`platform === 'twitch-clip'`), a video (`'twitch-video'`), or a stream whose `metadata.channelName` differs from `channel` (case-insensitive). The page's own on-mount `PLAY_URL` for the channel's live URL must NOT unfold. Unfolded resets to false when `channel` changes and when `offline` becomes false.
- Consumes: `useApp()` (`auth.isAuthenticated`, `channel.profile`, `channel.isLive`, `player.detection`), `URLDetectionResult` (`src/lib/urlDetection.ts`).

- [ ] **Step 1: Write the failing tests** (a wrapper that provides a controllable `useApp`): signed in + matching profile + not live gives `offline` true and `folded` true; signed out, a profile for another channel (stale data after a route change), `isLive` true, or no profile each give `offline` false; `showPlayer()` unfolds; a clip detection, a video detection and a stream detection for another channel unfold; the stream detection for the same channel (any letter case) does not; changing `channel` resets unfolded; `offline` going false then true again folds again.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** `useOfflineLayout`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** `feat: decide when a channel page is offline and whether its player is folded`.

### Task 4: Shared streamer block and the stats slot

**Files:** Create `src/hooks/useStreamerStats.ts`, `src/components/dashboard/StreamerBlock.tsx`, `src/components/channel/ChannelStatsSlot.tsx`, with tests in the matching `__tests__` folders. Modify `src/components/dashboard/TwitchDashboard.tsx`.

**Interfaces:**
- Produces: `isStreamerTier(user: TwitchUser | null): boolean` (affiliate or partner);
  `useStreamerStats(user: TwitchUser | null, enabled: boolean, onSessionExpired: () => void): StreamerStats` where `StreamerStats = { tracker: ReturnType<typeof useTrackerSummary>; numbers: ReturnType<typeof useStreamerNumbers>; history: ReturnType<typeof useStreamerHistory> }`; all three hooks get `null` ids (no request) unless `enabled && isStreamerTier(user)`; it must keep calling the hooks on every render, as the dashboard does today so its requests still start while the follows load;
  `StreamerBlock({ login, stats, now })` renders `StreamerRow` then `ThirtyDayPanels` exactly as the dashboard's current `streamerBlock` does;
  `ChannelStatsSlot({ channel })` renders the block only when the signed-in user is affiliate or partner and `user.login` equals `channel` (case-insensitive), else null. It uses `useSessionExpiry()` for the expired-token path and `useNow()` for `now`.
- Consumes: the existing hooks and components named above.

- [ ] **Step 1: Write the failing tests.** `useStreamerStats`: an affiliate with `enabled` true makes the three kinds of request; a non-streamer, `enabled` false, and a null user make none (mock the three hooks and assert the ids they receive). `ChannelStatsSlot`: renders the row and panels for the owner's affiliate channel (route letter case differs); renders nothing for another channel, for a non-streamer own channel, and signed out.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the hook, the block and the slot, then change `TwitchDashboard` to call `useStreamerStats(user, true, onSessionExpired)` where it calls the three hooks now and to render `<StreamerBlock .../>` where it builds `streamerBlock`.
- [ ] **Step 4: Run the new tests and the existing dashboard tests** (`src/components/dashboard/__tests__`, `src/pages/__tests__/ProtocolPage.twitch.expiry.test.tsx`). Expected: all pass, dashboard behaviour unchanged.
- [ ] **Step 5: Commit** `refactor: share the streamer block between the dashboard and the channel page`.

### Task 5: The folded-player strip

**Files:** Create `src/components/channel/OfflineStrip.tsx`, `src/components/channel/__tests__/OfflineStrip.test.tsx`.

**Interfaces:**
- Produces: `OfflineStrip({ lastStreamedAt: number | null; now: number; folded: boolean; onShowPlayer: () => void })`: one line with a status dot, "Offline", "last live <formatAgo>" when `lastStreamedAt` is not null, and a "Show player" button only while `folded`. `role="status"`, readable colours (use the contrast tokens already in `index.css`).
- Consumes: `formatAgo` (Task 1).

- [ ] **Step 1: Write the failing tests:** shows "Offline" and "last live 2 days ago" for a time 2 days back; omits the "last live" text for null (and never shows "NaN" or "Invalid"); the button shows while folded and calls `onShowPlayer` on click; no button when not folded.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** `OfflineStrip`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** `feat: the strip that stands in for a folded player`.

### Task 6: The offline layout

**Files:** Create `src/components/channel/OfflineLayout.tsx`, `src/components/channel/__tests__/OfflineLayout.test.tsx`. Modify `src/components/chat/ChatHeader.tsx`, `src/components/chat/ChatStrip.tsx` and their tests.

**Interfaces:**
- Produces: `ChatHeader` and `ChatStrip` each gain `fillControls?: boolean` (default true); false hides the Fill button, and on `ChatHeader` also the Fullscreen button; existing callers unchanged.
  `OfflineLayout({ channel: string; strip: ReactNode; player: ReactNode | null; children: ReactNode })`. One grid whose items are the strip, the player (only when `player` is not null), the chat and the body (`children`). Below `lg`: one column in the order strip, player, chat, body. From `lg`: two columns, the strip, player and body in the left column and the chat spanning every row in the right column, sticky below the header (`top: var(--header-height)`, height `calc(100vh - var(--header-height))`). Use `grid-template-areas` in literal Tailwind class strings (Tailwind cannot see built class names), with one set of classes for "player folded" and one for "player shown", and one for "chat hidden" (a single column from `lg`, the restore strip in the chat's place).
  Chat column: a vertical `ResizableHandle` (hidden below `lg`) then the chat panel (header, pop-out notice, `ScaledChat` + `ChatSource`), as `ChatDock` builds it, using `useChatPlacement`, `useChatPopout`, `useChatScale`. Width: `--offline-chat-width` set from `loadChatWidth()`, changed by dragging (drag left widens), clamped with `clampChatWidth(px, containerWidth)`, stored with `storeChatWidth` on drag end. Layout A height: a horizontal `ResizableHandle` below the chat (hidden from `lg`) inside a taller hit area (about 24px of padding around the 8px bar), default chat height 360px, dragged height from `nextFloatingHeight` and `availableChatHeight`, stored with `storeFloatingHeight`, applied with `floatingHeightCss` below `lg` only.
  Header props: `side="right"`, `dockControls={false}`, `fillControls={false}`, `fullscreenSupported={false}`, `videoControl={null}`, `dragHandleProps={{}}`.
- Consumes: Task 1 helpers; `chatLayout.ts`; the chat hooks and components named in `ChatDock.tsx`.

- [ ] **Step 1: Write the failing tests** (mock `ChatSource` and `ScaledChat` to simple divs): the chat element renders exactly once and the same node survives a re-render with `player` switched between null and a node; the strip, then the body, are in the document, and `player` content only when given; the header shows text size, hide and pop out but no swap-side, grip, Fill or Fullscreen control; clicking hide replaces the chat with a restore strip labelled "Show chat" and clicking it restores the chat (the iframe mock mounts again); a pop-out replaces it with "Return chat to the page"; a stored width of 9999 or `'abc'` renders the default (360px) in `--offline-chat-width`; dragging the width handle by -60px on a container of 1400px sets 420px and stores it; dragging the height handle taller stores the height through `storeFloatingHeight`; both handles have the right accessible names ("Resize chat width", "Resize chat height").
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the two flags and `OfflineLayout`.
- [ ] **Step 4: Run to verify they pass,** plus the existing `ChatHeader`/`ChatStrip`/`ChatDock` tests (`src/components/chat/__tests__`). Expected: all pass.
- [ ] **Step 5: Commit** `feat: the offline channel layout with a tall pinned chat`.

### Task 7: Compose the page

**Files:** Create `src/components/channel/ChannelBody.tsx`. Modify `src/pages/TwitchPlayerPage.tsx`, `src/pages/__tests__/TwitchPlayerPage.fill.test.tsx`, `src/pages/__tests__/TwitchPlayerPage.scroll.test.tsx` if its setup needs it. Create `src/pages/__tests__/TwitchPlayerPage.offline.test.tsx`.

**Interfaces:**
- Produces: `ChannelBody({ channel }: { channel: string | undefined })`: the sections now inline in `TwitchPlayerPage` below the dock, in this order: profile sidebar, `ChannelStatsSlot`, stats row, debug panel, clips and VODs row, each in the same `fill-hide max-w-[1600px] mx-auto w-full` wrapper as today.
  `TwitchPlayerPage` calls `useOfflineLayout(channel)` and `useChannelLive({ userId: state.channel.profile?.id ?? null, enabled: layout.offline, onSessionExpired })` (`useSessionExpiry`). When `layout.offline` it renders `<OfflineLayout channel strip={<OfflineStrip/>} player={layout.folded ? null : <the PlayerHost box>}><ChannelBody/></OfflineLayout>`; otherwise today's `ChatDock` then `ChannelBody`. `lastStreamedAt` comes from `state.channel.videos`, `now` from `useNow`. When `layout.offline` turns false (go-live) the page scrolls to the top. When the viewer unfolds the player by choice it scrolls to it.
- Consumes: Tasks 2 to 6.

- [ ] **Step 1: Write the failing tests** (new file; real provider or a controllable `useApp`, heavy children mocked): a live signed-in channel renders `ChatDock` and no `OfflineLayout`; an offline signed-in channel renders `OfflineLayout`, the strip, and no `PlayerHost`; signed out renders `ChatDock`; clicking "Show player" mounts `PlayerHost` and keeps the single chat; choosing a clip (dispatch a clip `PLAY_URL`) unfolds it; after `UPDATE_CHANNEL_STREAM` makes the channel live the page renders `ChatDock` again and calls `window.scrollTo` with `top: 0`; going live while already unfolded mounts exactly one `PlayerHost`; a route change to another channel starts folded again; `ChannelStatsSlot` is present in both layouts; the poll hook is enabled only in the offline layout. Extend the `useApp` mock in the fill test with `channel: { profile: null, isLive: false, videos: [] }`, `auth: { isAuthenticated: false }`, `loading: false`.
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL (new file) and the fill test still passing after its mock is extended (run it to confirm the baseline first).
- [ ] **Step 3: Implement** `ChannelBody` and the page changes.
- [ ] **Step 4: Run the new tests and every test under `src/pages/__tests__`.** Expected: all pass, including the three fill-hide expectations.
- [ ] **Step 5: Commit** `feat: show the offline layout on a channel page that is not live`.

### Task 8: Make the body follow its own column

**Files:** Modify the class strings of `src/components/channel/StatsRow.tsx`, `ClipGrid.tsx`, `VODGrid.tsx`, `src/components/dashboard/ThirtyDayPanels.tsx`, the clips/VODs row in `ChannelBody.tsx`, and the wrapper in `ChannelBody.tsx` (add `@container`).

**Interfaces:** class changes only: `lg:grid-cols-4` (StatsRow), `md:grid-cols-2 xl:grid-cols-3` (the grids), `lg:flex-row lg:w-1/2` (clips/VODs row) and `md:grid-cols-3` (`ThirtyDayPanels`) become the matching container variants (`@2xl:`, `@3xl:`, `@4xl:` as fits), with the thresholds chosen so a full-width live page looks the same as today at 1280px and 1100px.

- [ ] **Step 1: Run the existing tests for the touched components** (record the baseline; some may assert class names).
- [ ] **Step 2: Change the classes** and update any test that asserted a viewport class name to the container class.
- [ ] **Step 3: Check in the built-in pane** at 1100px and 768px on an offline channel's page (mocked data as in the PR 77 checks, or a real signed-in channel) and at 1280px on a live channel's page: the cards, grids and panels use their column sensibly and the live page is unchanged.
- [ ] **Step 4: Run the touched components' tests.** Expected: all pass.
- [ ] **Step 5: Commit** `fix: let the channel page's cards and grids follow their own column width`.

### Task 9: Whole-branch verification and hand-off

- [ ] **Step 1: Run the whole suite** (`--maxWorkers=2`), `tsc -b`, `eslint .`, and `npm run build`; read each result file. Expected: all pass, 0 lint errors (the two older unused-directive warnings are known), `git diff main -- package.json package-lock.json` empty.
- [ ] **Step 2: Browser checks in the built-in pane** (start the dev server only after the suite is done): offline signed-in channel at 1100px (strip, left column, tall pinned chat that stays while scrolling, width handle works and survives a reload), the same at 900px and 375px (layout A, height bar works with a finger-sized target), resizing across `lg` without the chat reloading (watch the iframe `src`/load count), hide and pop out of the chat in C, "Show player", a clip click while folded, a live channel unchanged (apart from the stats slot on the owner's own channel), signed out unchanged, and the owner's own channel showing the streamer row and 30-day panels between the profile and the four cards. Record anything not checked (a real offline channel, a real go-live) as "not checked".
- [ ] **Step 3: One fresh whole-branch review, one fix pass** as the executing-plans skill describes, then open the PR with the Co-Authored-By line in its description only.
