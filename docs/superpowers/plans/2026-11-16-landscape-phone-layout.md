# Landscape Phone Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone held sideways, the Twitch player page is the video filling the screen, the chat pushes in beside it on demand, and the follow rail is hidden.

**Architecture:** One media query (`LANDSCAPE_PHONE_QUERY`, height-based) drives everything. `ChatDock` reads it through a hook and, when it matches, reuses fill mode (`data-fill="all"`) and lays the chat out as an always-mounted, width-animated column beside the video, opened by a handle column (tap or swipe). A CSS rule keyed to the same query hides the rail and frees the gutter it reserves. Nothing persisted changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-16-landscape-phone-layout-design.md`

## Global Constraints

- Query string, exactly: `(orientation: landscape) and (max-height: 500px)` (`LANDSCAPE_PHONE_QUERY`). Height, not width.
- Nothing is ever drawn over the video: the handle and the chat panel are siblings of `data-testid="chat-player"`, never children of it, and never absolutely positioned over it.
- Landscape chat visibility is runtime state, default closed, never persisted. `STORAGE_KEYS.LOCAL_CHAT_PLACEMENT` and `LOCAL_FILL_MODE` are neither read as landscape state nor written by it.
- Portrait, tablet and desktop behaviour is unchanged: the whole existing suite must keep passing untouched.
- Rotating must not remount the player (it stays the first child of the dock row).
- Chat column width: `max(38%, 280px)` when open, `0px` when closed. Handle touch target at least 44px.
- Commit messages carry no `Co-Authored-By` line (project rule: it goes in PR descriptions only). Work on branch `feat/landscape-phone-layout`; never commit to `main`.
- The jsdom `matchMedia` in `src/test/setup.ts` is fixed (`matches: false`, no-op listeners). Tests that need it stub it with `vi.stubGlobal('matchMedia', ...)`, as `src/components/streams/__tests__/AboutPanel.test.tsx` does, or mock the hook.
- CSS cannot import the constant, so tests assert `index.css` contains `LANDSCAPE_PHONE_QUERY` verbatim (the `?raw` import pattern of `fillHideCss.test.ts`).

## Review Focus

- Rotating portrait → landscape mid-playback remounts the player (stream restarts). Pinned in Task 4.
- Desktop has `hidden: true` saved, then the phone goes landscape: the chat must still be openable, and the saved value must be untouched afterwards. Task 4.
- Chat popped out into its own window while in landscape: the handle must offer "Return chat to the page", not a dead toggle. Task 4.
- A vertical scroll or a tiny drag on the handle must not toggle the chat. Task 3.
- No channel (`channel` undefined) in landscape: panel shows "No channel", handle still works, no crash. Task 4.

---

### Task 1: The landscape-phone hook

**Files:**
- Create: `src/components/chat/landscapePhone.ts`, `src/components/chat/useLandscapePhone.ts`
- Test: `src/components/chat/__tests__/useLandscapePhone.test.ts`

**Interfaces:**
- Produces: `export const LANDSCAPE_PHONE_QUERY: string` (value in Global Constraints); `export function useLandscapePhone(): boolean`.

- [ ] **Step 1: Write the failing test.** Stub `matchMedia` with a controllable fake (`matches`, a listener set, a `change(next: boolean)` helper that fires listeners). Tests: `'is false when the query does not match'`; `'is true when it matches'`; `'follows a change event without remounting'` (render, `act(() => fake.change(true))`, expect true then false again); `'asks matchMedia for exactly LANDSCAPE_PHONE_QUERY'`; `'is false when matchMedia is missing'` (stub `matchMedia` as undefined).
- [ ] **Step 2: Run it, expect FAIL** (modules missing): `node ./node_modules/vitest/vitest.mjs run src/components/chat/__tests__/useLandscapePhone.test.ts`
- [ ] **Step 3: Implement** both files. The hook uses `useSyncExternalStore`, subscribing with `addEventListener('change', …)` on `window.matchMedia(LANDSCAPE_PHONE_QUERY)` and guarding `typeof window.matchMedia !== 'function'` (snapshot `false`).
- [ ] **Step 4: Run it, expect PASS.**
- [ ] **Step 5: Commit** `feat: a hook that says whether the phone is held sideways`

### Task 2: Hide the rail (and free its gutter) in landscape phone

**Files:**
- Modify: `src/index.css` (after the fill-hide rules, ~line 98), `src/components/rail/ChannelRail.tsx:209` (add the class to the container's `className`)
- Test: `src/components/chat/__tests__/landscapePhoneCss.test.ts`, extend `src/components/rail/__tests__/ChannelRail.test.tsx`

**Interfaces:**
- Consumes: `LANDSCAPE_PHONE_QUERY` (Task 1).
- Produces: CSS class `landscape-phone-hide` (display none, important) and an override setting `--rail-reserve-left` / `--rail-reserve-right` to `0px !important` on `:root`, both inside `@media <LANDSCAPE_PHONE_QUERY>`.

- [ ] **Step 1: Write failing tests.** CSS test (raw import): `'index.css has a media block with LANDSCAPE_PHONE_QUERY'`; `'that block hides .landscape-phone-hide'`; `'that block zeroes both rail reserve variables with !important'` (inline styles set by ChannelRail would otherwise win). Rail test: `'the rail container carries landscape-phone-hide'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the CSS block and add `landscape-phone-hide` to the rail's class list. The variable override is needed because `RailGutter` pads player pages by those variables even while the rail is `display: none`.
- [ ] **Step 4: Run, expect PASS** (also run `src/components/rail` and `fillHideCss.test.ts`).
- [ ] **Step 5: Commit** `feat: the follow rail steps aside when the phone is held sideways`

### Task 3: Swipe intent and the handle column

**Files:**
- Create: `src/components/chat/landscapeSwipe.ts`, `src/components/chat/LandscapeChatHandle.tsx`
- Test: `src/components/chat/__tests__/landscapeSwipe.test.ts`, `src/components/chat/__tests__/LandscapeChatHandle.test.tsx`

**Interfaces:**
- Produces: `export function swipeIntent(start: {x: number; y: number}, end: {x: number; y: number}, side: DockSide): 'open' | 'close' | null`. Needs `|dx| >= 40` and `|dx| > |dy|`. Chat on the right: dx < 0 opens, dx > 0 closes; chat on the left is mirrored.
- Produces: default export `LandscapeChatHandle({ side, open, label, onToggle }: { side: DockSide; open: boolean; label: string; onToggle: () => void })`: a column (`data-testid="landscape-chat-handle"`, `w-11`, full height, `shrink-0`) holding one button (`aria-label={label}`, `aria-expanded={open}`, a `MessageSquare` icon, `STRIP_BUTTON_LOOK`). Tap calls `onToggle`. Touch start/end on the column calls `onToggle` when `swipeIntent` returns `'open'` while closed or `'close'` while open.

- [ ] **Step 1: Write failing tests.** `swipeIntent`: right side, `dx=-60,dy=5` → `'open'`; `dx=60` → `'close'`; left side mirrored; `dx=-20` → `null` (too short); `dx=-60,dy=80` → `null` (vertical wins); exactly 40 → counts. Handle: click calls `onToggle` once; swipe in the opening direction while closed calls it once; the same swipe while open does not; a vertical drag does not; `aria-expanded` follows `open`; the button exposes the given label.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: a handle that slides the chat in and out`

### Task 4: ChatDock landscape layout

**Files:**
- Modify: `src/components/chat/ChatDock.tsx`
- Test: create `src/components/chat/__tests__/ChatDock.landscape.test.tsx` (follow `ChatDock.test.tsx`: mock `useChatPopout` and `useFullscreen`; additionally `vi.mock('../useLandscapePhone')` and drive it per test)

**Interfaces:**
- Consumes: `useLandscapePhone()` (Task 1), `LandscapeChatHandle` (Task 3), existing `useChatPlacement`, `useChatPopout`, `useFloatingVideo`, `fillScopeFor`.
- Produces: no new exports.

Behaviour, when `landscapeLayout = landscape && !floating`:
- Fill scope is forced to `'all'` (so `data-fill="all"` is on the root and the row is `ROW_FILL_ALL`), regardless of the saved fill setting. In every other case today's logic is untouched.
- Local state `landscapeChatOpen` (default `false`, not persisted). Effective chat visibility for the column is `landscapeChatOpen && !popout.isOpen`.
- The row uses an unprefixed `flex-row` (`flex-row-reverse` for `side === 'left'`) in place of `flex-col md:flex-row`.
- Children, in order: the player wrapper (unchanged position; `flex: 1 1 0%`), the handle (`label`: `Hide chat` when open, `Return chat to the page` when popped out, else `Show chat`; popped out, a tap calls `popout.close`), the chat panel. Handle and panel are siblings of the player wrapper.
- The chat panel is always mounted (iframe never reloads on toggle). Closed: `flex-basis: 0px`, `overflow: hidden`, `visibility: hidden`, `aria-hidden`, no border. Open: `flex: 0 0 max(38%, 280px)`. Width transition 200ms (respect `prefers-reduced-motion`: none).
- No docking controls in this mode: no resize handle, no "Move chat" buttons, no drag handle. The header's Hide button closes the column (`landscapeChatOpen = false`) and does not call the saved `hide`.
- With no `channel`, the panel shows the existing "No channel" text.

- [ ] **Step 1: Write failing tests** (names exact): `'forces data-fill=all in landscape even with fill off'`; `'removes data-fill again when the phone goes back to portrait'`; `'starts with the chat mounted but closed (iframe present, panel aria-hidden, handle says Show chat)'`; `'the handle opens it and then says Hide chat, aria-expanded true'`; `'a swipe on the handle opens it'`; `'Hide in the chat header closes it'`; `'never writes LOCAL_CHAT_PLACEMENT or LOCAL_FILL_MODE'` (compare localStorage before and after open/close); `'opens even when the saved placement says hidden'`; `'the handle and chat panel are siblings of chat-player, not inside it'`; `'does not remount the player when the phone rotates'` (player counts its mounts via an effect; rerender with the hook flipped; expect one mount); `'with the chat popped out the handle says Return chat to the page and calls popout.close'`; `'with no channel it shows No channel and the handle still toggles'`; `'is today's layout when the hook is false'` (`md:flex-row`, no handle).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `ChatDock.tsx` as described. If the file grows unwieldy, move the landscape column's class/style constants next to the existing ones rather than a new file; the player wrapper must not change position in the tree.
- [ ] **Step 4: Run** `src/components/chat` and `src/pages`, expect all PASS (the existing dock tests are the portrait regression check).
- [ ] **Step 5: Commit** `feat: landscape phones get a full-screen video with a chat that slides in beside it`

### Task 5: Whole-suite check and a look at it in a browser

**Files:** none (a short note in `CLAUDE.md` Key Files for `landscapePhone.ts`, `useLandscapePhone.ts`, `LandscapeChatHandle.tsx` is the only edit).

- [ ] **Step 1:** `node ./node_modules/vitest/vitest.mjs run`, `node ./node_modules/typescript/bin/tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`: all clean. (A suite that fails to load with `UNKNOWN ... aria-query` is the known Windows flake: re-run it first.)
- [ ] **Step 2:** Start the dev server (see memory `reference_localhost_5000_testing.md` for how to reach a channel page without a Twitch login). In the built-in browser, `resize_window` to 844x390 then 667x375. Check by script: `matchMedia('(orientation: landscape) and (max-height: 500px)').matches` is true; `document.documentElement.dataset.fill === 'all'`; the rail has computed `display: none`; the chat handle is visible and the video box fills the viewport height; clicking the handle narrows the video and shows the chat (box widths sum to the viewport, no overlap); Show/Hide flips. Then 390x844: today's stacked layout, rail present, no `data-fill`. Reset the viewport to desktop afterwards.
- [ ] **Step 3:** Report what could not be checked (Twitch embed autoplay and real touch swipes need a phone). Do not open a PR; the owner decides.
- [ ] **Step 4: Commit** `docs: list the landscape phone files in CLAUDE.md`
