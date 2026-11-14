# Playlist stream preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play any non-removed stream from its row on `/admin/playlist`, with a link that opens it on its own page.

**Architecture:** `StreamPlayerPanel` gains one optional `onTryAs` prop; a new `StreamPreview` wraps it for one `AdminStream` (own kind state, link, "cannot be played here" case); `PlaylistScreen` opens one preview row under the clicked row, the way the inline edit row works.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), the existing `PlayerHost` (mocked in tests).

**Spec:** `docs/superpowers/specs/2026-11-14-playlist-stream-preview-design.md`

## Global Constraints

- `src/components/player/PlayerHost.tsx`, `VideoJSPlayer.tsx`, `src/types/player.ts`, `src/components/search/SmartUrlInput.tsx` are not edited.
- The address is shown as its host only (never the full address as text); the full address is used only to play it and inside the link's `href`.
- Commits carry no `Co-Authored-By` line. No push until Task 3 is verified; then push to `claude/playlist-store-8d7378` (PR #82).
- Names and groups come from a public list: shown as text only.

## Review Focus

- A removed stream: no Play button. A stream whose address is not http(s) or is a Twitch/YouTube address: "cannot be played here" instead of a player, never a crash.
- Closing: the preview closes on page change, filter change, edit, remove, and when its stream leaves the list after a reload.

---

### Task 1: `onTryAs` on the player panel

**Files:**
- Modify: `src/components/player/StreamPlayerPanel.tsx`
- Test: `src/components/player/__tests__/StreamPlayerPanel.test.tsx`

**Interfaces:**
- Produces: `StreamPlayerPanel` prop `onTryAs?: (kind: StreamKind) => void`. When given, "try as" calls it and does not navigate; when absent the behaviour is unchanged (navigate to `buildStreamPath(url, kind)` with `replace`).

- [ ] **Step 1: Failing test** `calls onTryAs instead of navigating when one is given`. Change the file's mocks so `PlayerHost` renders `renderError('boom')` only when a hoisted `failWith` flag is set, and `StreamErrorCard` renders `<button onClick={() => onTryAs('dash')}>try as dash</button>`; render inside a `MemoryRouter` with a `Routes` that shows the location path. Assert: with `onTryAs` given, clicking calls it with `'dash'` and the path is still `/`; a second test without `onTryAs` asserts the path becomes `/hls-dash/custom` (existing behaviour pinned).
- [ ] **Step 2:** Run `node ./node_modules/vitest/vitest.mjs run src/components/player/__tests__/StreamPlayerPanel.test.tsx`. Expected: the new test FAILS (navigation happens).
- [ ] **Step 3:** Add the prop to `StreamPlayerPanelProps`; in `tryAs` call `onTryAs(next)` when defined, else navigate as now (keep `navigate` in the dependency list).
- [ ] **Step 4:** Re-run the file. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the stream player panel can hand "try as" to its page`.

### Task 2: `StreamPreview`

**Files:**
- Create: `src/components/admin/StreamPreview.tsx`
- Test: `src/components/admin/__tests__/StreamPreview.test.tsx`

**Interfaces:**
- Consumes: `StreamPlayerPanel` (Task 1), `AdminStream` and `StreamState` from `src/lib/adminApi.ts`, `detectURLType`/`detectURLTypeAs`/`StreamKind` from `src/lib/urlDetection.ts`, `buildStreamPath` from `src/lib/routes.ts`.
- Produces: `export default function StreamPreview(props: { stream: AdminStream; onClose: () => void })`. Renders `role="region"` named `Preview of ${stream.name}` containing: the line `Playing as HLS · host` (kind label `HLS`/`DASH`/`MP4`, host only), a **Close** button (calls `onClose`), an **Open in a new tab** link (`target="_blank"`, `rel="noopener noreferrer"`), and the player. The link is `/hls-dash/${publicId}` when `stream.state` is `new`, `working` or `suspect`, else `buildStreamPath(stream.url, kind)`. "Try as" sets a local `kind` state (starts at `stream.kind`) and remounts the player (a `key` on address and kind); nothing is saved. An address that is not http(s), or that `detectURLType` calls `twitch` or `youtube`, shows `This address cannot be played here.` and no player (Close stays).

- [ ] **Step 1: Failing tests** (mock `StreamPlayerPanel` as a stub that shows `kind` and exposes a button calling the `onTryAs` it receives with `'dash'`): region name and the `Playing as HLS · secret-host.test:8443` line with no `path.m3u8` anywhere in the HTML; Close calls `onClose`; link `href` for a `new` stream is `/hls-dash/0123456789ab` and for a `held` stream is `/hls-dash/custom?url=<encoded>&as=hls`, both with `target="_blank"` and `rel` containing `noopener`; "try as dash" changes the line to `Playing as DASH · …` and the unlisted link to `&as=dash`; `rtmp://x.test/a`, `https://www.twitch.tv/x` and `https://youtu.be/abc` show the cannot-be-played line and no stub player.
- [ ] **Step 2:** Run the new file. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `StreamPreview` per the Interfaces block; at most 640 px wide (`max-w-[640px]`), `heading={false}`, `className` of the panel without the page padding.
- [ ] **Step 4:** Re-run. Expected: pass.
- [ ] **Step 5: Commit** `feat: a preview for one playlist stream`.

### Task 3: Play on the Playlist screen

**Files:**
- Modify: `src/components/admin/PlaylistScreen.tsx`, `src/components/admin/__tests__/PlaylistScreen.test.tsx` (render inside `MemoryRouter`), `docs/superpowers/specs/2026-11-13-playlist-admin-design.md` ("Piece 2 as built", Stage C: one line), `CLAUDE.md` (Key Files: one line)
- Test: `src/components/admin/__tests__/PlaylistScreen.test.tsx`

**Interfaces:**
- Consumes: `StreamPreview` (Task 2).
- Produces: `previewing: string | null` state (a `publicId`); a **Play** button (`aria-label` `Play ${name}`) in the actions of every row whose state is not `removed`; the preview in a row under that stream's row (`<tr><td colSpan={6}>`). Opening one closes any other.

- [ ] **Step 1: Failing tests** (mock `../StreamPreview` as a stub showing the stream name and a Close button): Play opens the preview under that row and a second Play moves it; Close closes it; a removed stream has no Play; the preview closes on Next page, on changing the State filter, on Edit (the edited row) and on Remove confirmation of that row; after a reload that no longer lists the stream the preview is gone.
- [ ] **Step 2:** Run the file. Expected: the new tests FAIL.
- [ ] **Step 3:** Add `previewing` state and the button; render the extra row for `previewing === s.publicId`; clear `previewing` in the page, filter, edit and remove handlers, and derive "open" from `data.streams.some(...)` so a vanished stream closes it.
- [ ] **Step 4:** Run the file, then the whole front end: `node ./node_modules/vitest/vitest.mjs run`, `node ./node_modules/typescript/bin/tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`, `node ./node_modules/vite/bin/vite.js build`. Expected: all pass (eslint: 0 errors).
- [ ] **Step 5: Commit** `feat: play a stream in place on the Playlist screen`; look at it on `http://localhost:5000/admin/playlist` (owner's own sign-in) before pushing.
