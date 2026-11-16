# Portrait Box, Narrow Rail and Offline Landscape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop cropping the Twitch video in portrait (300px minimum box), hide the follow rail below `md`, and give the offline-channel page the same landscape-phone layout as the live page.

**Architecture:** Small class/CSS changes for the first two. For the third, `OfflineLayout` is restyled in place (so the player never remounts) using pieces shared with `ChatDock`: the landscape chat column classes and a `useFillScope` hook.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-16-portrait-and-offline-landscape-design.md` (builds on `2026-11-16-landscape-phone-layout-design.md`, merged in PR #86).

## Global Constraints

- Work in the worktree `C:/Dev/projects/_prism-offline` on branch `feat/portrait-and-offline-landscape` (from `origin/main` `4bc2c3b`). Never touch the shared checkout at `C:/Dev/projects/PRISM`.
- Run tests with `node ./node_modules/vitest/vitest.mjs run <paths>` (never `npx`); typecheck `node ./node_modules/typescript/bin/tsc -b`; lint `node ./node_modules/eslint/bin/eslint.js .`.
- Landscape query is `LANDSCAPE_PHONE_QUERY` (`(orientation: landscape) and (max-height: 500px)`). The narrow-rail query is `(width < theme(--breakpoint-md))`, never a pixel width.
- The video box minimum is `300px` (`min-h-[300px]`). In landscape mode the open chat column leaves the video at least 400px wide: `max(0px, min(max(38%, 280px), calc(100% - 2.75rem - 400px)))`.
- Nothing is drawn over the video. The player must not remount on rotation. Landscape mode writes neither `LOCAL_CHAT_PLACEMENT` nor `LOCAL_FILL_MODE` nor the offline chat width/height keys.
- Commit messages carry no `Co-Authored-By` line (it goes in the PR description only). Never commit to `main`. The jsdom `matchMedia` in `src/test/setup.ts` is fixed at `false`: mock `useLandscapePhone` as `ChatDock.landscape.test.tsx` does.
- A full `vitest` run also picks up stale copies under `.claude/worktrees/` and has known failures on `main` (CountryFlag, StreamCard, AboutPanel; `adminAuth` depends on `.env`): judge by the suites named in each task.

## Review Focus

- Rotating while a recording plays on the offline page must not remount the player. Task 4.
- Offline page with the chat saved hidden: landscape must still be able to open the chat, and the saved value stays. Task 4.
- Offline page with the video floating (`useFloatingVideo().isFloating`) in landscape: ordinary layout, no crash. Task 4.
- The 300px box must not break fill mode or fullscreen (they size the player to the window). Task 1.
- The rail media query must track the `md:` breakpoint (a hard-coded pixel width would not). Task 2.

---

### Task 1: The 300px video box

**Files:**
- Modify: `src/components/chat/ChatDock.tsx` (`PLAYER_NORMAL`, `PLAYER_FILL_MD`), `src/components/channel/OfflineLayout.tsx` (the player wrapper at the `aspect-video` div; add `data-testid="offline-player"`)
- Test: `src/components/chat/__tests__/ChatDock.test.tsx`, `src/components/channel/__tests__/OfflineLayout.test.tsx`

**Interfaces:**
- Produces: the player wrapper classes below; `data-testid="offline-player"` on the offline player wrapper.

- [ ] **Step 1: Write failing tests.** ChatDock: `'the player box is never shorter than 300px'` (`chat-player` has class `min-h-[300px]`); `'fill mode on md and up lets the player box go below 300px'` (with saved fill on, `chat-player` has `md:min-h-0`). OfflineLayout: `'the player box is never shorter than 300px'` (`offline-player` has `min-h-[300px]`; render with a non-null `player`).
- [ ] **Step 2: Run them, expect FAIL.**
- [ ] **Step 3: Implement.** Add `min-h-[300px]` to `PLAYER_NORMAL` and the offline player wrapper; add `md:min-h-0` to `PLAYER_FILL_MD`; `PLAYER_FILL_ALL` (landscape/fullscreen with no chat) gets `min-h-0`.
- [ ] **Step 4: Run `src/components/chat src/components/channel`, expect PASS.**
- [ ] **Step 5: Commit** `fix: the Twitch video box is never shorter than the 300px its embed needs`

### Task 2: Rail hidden below md

**Files:**
- Modify: `src/index.css` (a second block after the landscape-phone one), `src/components/rail/ChannelRail.tsx` (add class `narrow-hide`)
- Test: `src/components/chat/__tests__/narrowRailCss.test.ts` (new), `src/components/rail/__tests__/ChannelRail.test.tsx`

**Interfaces:**
- Produces: CSS class `narrow-hide` (display none !important) and `:root` overrides zeroing `--rail-reserve-left` / `--rail-reserve-right` with `!important`, inside `@media (width < theme(--breakpoint-md))`.

- [ ] **Step 1: Write failing tests** (raw CSS import, as `fillHideCss.test.ts`): `'has a media block for width below the md theme breakpoint'`; `'does not hard-code a pixel width in it'`; `'hides .narrow-hide in that block'`; `'zeroes both rail reserve variables with !important in that block'`. Rail: `'carries narrow-hide so it steps aside on narrow windows'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the CSS block and the class on the rail container.
- [ ] **Step 4: Run `src/components/chat src/components/rail`, expect PASS.**
- [ ] **Step 5: Commit** `feat: the follow rail steps aside on narrow windows`

### Task 3: Share the landscape pieces

**Files:**
- Create: `src/components/chat/landscapeChat.ts`, `src/components/chat/useFillScope.ts`
- Modify: `src/components/chat/ChatDock.tsx` (import the shared constants; use `useFillScope`)
- Test: `src/components/chat/__tests__/useFillScope.test.ts` (new); the existing `ChatDock*.test.tsx` suites are the regression check

**Interfaces:**
- Produces (`landscapeChat.ts`): `export const LANDSCAPE_CHAT_BASE`, `LANDSCAPE_CHAT_OPEN`, `LANDSCAPE_CHAT_CLOSED` (string constants moved verbatim from `ChatDock.tsx`), and `export function landscapeHandleLabel(open: boolean, poppedOut: boolean): string` returning `'Return chat to the page'` when popped out, else `'Hide chat'` when open, else `'Show chat'`.
- Produces (`useFillScope.ts`): `export function useFillScope(scope: FillScope | null): void`, which sets `FILL_ATTRIBUTE` on `document.documentElement` to `scope` in a layout effect while non-null and removes it on cleanup or change.

- [ ] **Step 1: Write failing tests.** `useFillScope`: `'sets data-fill while a scope is given'`; `'removes it when the scope becomes null'`; `'removes it on unmount'`. `landscapeHandleLabel`: the three outputs.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both modules; in `ChatDock.tsx` delete the local constants and the inline `useLayoutEffect` for the attribute, and use the imports (the handle label there uses `landscapeHandleLabel`).
- [ ] **Step 4: Run `src/components/chat src/pages`, expect PASS** (no behaviour change).
- [ ] **Step 5: Commit** `refactor: the landscape chat classes and the fill attribute live in shared modules`

### Task 4: Offline page in landscape

**Files:**
- Modify: `src/components/channel/OfflineLayout.tsx`
- Test: `src/components/channel/__tests__/OfflineLayout.landscape.test.tsx` (new; follow `OfflineLayout.test.tsx` for providers and mocks; additionally `vi.mock('../../chat/useLandscapePhone')`)

**Interfaces:**
- Consumes: `useLandscapePhone()`, `useFillScope`, `LANDSCAPE_CHAT_*`, `landscapeHandleLabel`, `LandscapeChatHandle` (`{ side, open, label, onToggle }`, `data-testid="landscape-chat-handle"`).
- Produces: no new exports.

Behaviour, when `sideways = landscape && player !== null && !floating`:
- `useFillScope(sideways ? 'all' : null)`.
- Root (`data-testid="offline-layout"`): `fixed inset-0 z-50 flex flex-row bg-[var(--bg)]` instead of the grid classes; the strip wrapper and body wrapper get `hidden` (still mounted).
- Player wrapper (`offline-player`): `relative flex-1 min-w-0 overflow-hidden`, with no `aspect-video`, `min-h-[300px]`, rounding or border.
- A `LandscapeChatHandle` (`side="right"`) between the player wrapper and the chat cell; local `landscapeChatOpen` state, default false; label from `landscapeHandleLabel`; popped out, a tap calls `popout.close`.
- The chat is rendered in sideways mode even when the saved placement is hidden (ignore `placement.hidden` there). The chat cell (`chat-cell`) takes `LANDSCAPE_CHAT_BASE` plus `LANDSCAPE_CHAT_OPEN` or `LANDSCAPE_CHAT_CLOSED`, loses the grid-area/sticky/height classes, and gets `aria-hidden` while closed. Inside, the width and height resize handles are hidden and the panel is `h-full`. Popped out, the panel counts as closed.
- Swipe closing and tap behave as on the live page. Nothing is written to storage.

- [ ] **Step 1: Write failing tests** (names exact): `'is today's grid when the phone is not sideways'`; `'is today's grid when sideways but the player is folded'`; `'forces data-fill=all when sideways with a player'`; `'removes data-fill when the phone goes back to portrait'`; `'the root is a fixed full-window row, with the strip and body hidden but mounted'`; `'the player wrapper fills the row and is not 16:9'`; `'starts with the chat closed and the handle saying Show chat'`; `'the handle opens it and the width keeps the video at least 400px'` (class contains `calc(100%_-_2.75rem_-_400px)`); `'opens even when the saved placement says hidden, and leaves the saved value alone'`; `'never writes chat placement, fill or the offline chat width/height'`; `'does not remount the player when the phone rotates'` (mount-counting probe, as the live test); `'with the chat popped out the handle says Return chat to the page and calls popout.close'`; `'with the video floating it keeps the ordinary layout'`; `'hides the width and height resize handles'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `OfflineLayout.tsx`. Keep the conditional handle slot as `{sideways && <LandscapeChatHandle … />}` so neighbouring elements keep their positions in the tree.
- [ ] **Step 4: Run `src/components/channel src/components/chat src/pages`, expect PASS.**
- [ ] **Step 5: Commit** `feat: the offline channel page gets the landscape phone layout while a recording plays`

### Task 5: Whole-branch checks

- [ ] **Step 1:** `tsc -b` clean; eslint 0 errors; `vitest run src/components src/pages src/hooks src/lib` has only failures that also fail on `main` (name them).
- [ ] **Step 2:** Browser check (dev server from the worktree: `node ./node_modules/vite/bin/vite.js` in the background; prove the served tree with a fetch of `/src/components/chat/landscapeChat.ts`): 390x844 live page: video box 300px tall, rail `display: none`, page 390 wide; 800x600: box at least 300px; 844x390 live page still works. The offline page needs a signed-in, not-live channel: drive the app state per memory `reference_localhost_5000_testing.md`, or say it could not be checked and rely on the tests.
- [ ] **Step 3:** Add the new files to the `CLAUDE.md` Key Files entry for landscape. Commit `docs: list the shared landscape files in CLAUDE.md`.
- [ ] **Step 4:** One fresh review of the branch (a single agent, EXPLORATORY), then fix Critical/Important with tests first.
