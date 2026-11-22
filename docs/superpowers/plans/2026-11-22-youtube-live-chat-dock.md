# YouTube Live Chat Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live video on `/youtube/<videoId>` shows YouTube's chat in the Twitch page's `ChatDock`.

**Architecture:** `ChatDock` gains `kind: ChatKind` (default `'twitch'`) and passes it to `ChatSource` and `useChatPopout`; the linked-streamer button only runs for Twitch. `YoutubePlayerPage` decides its layout from `useVideoPage` before mounting the player: live → the player inside `ChatDock kind="youtube"` at the dock's own width; otherwise today's layout.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (`node ./node_modules/vitest/vitest.mjs run <path>`).

**Spec:** `docs/superpowers/specs/2026-11-22-youtube-live-chat-dock-design.md`

## Global Constraints

- No new API calls: live comes from `data.live.state` (`getVideoPage`).
- The chat target is `encodeTarget({ kind: 'video', videoId, channelId: data.channelId })`.
- The player mounts once per video: not before `useVideoPage` leaves `'loading'`, never moved afterwards.
- Twitch page and `OfflineLayout` behaviour unchanged.

## Review Focus

- **Details unavailable (no key, quota):** status `'unavailable'` must mount the player in today's layout, not wait forever. Test in Task 2.
- **Live video with an empty `channelId`:** still docks; target falls back to `v:<id>` (no `@`). Test in Task 2.
- **Topic grid open on a live video** (`activeTopic`): the dock's player slot shows the topic grid as today's box does. Test in Task 2.
- **Video floating while live:** the dock handles it (as on Twitch); `FloatingPanel` is not also rendered by the page. Test in Task 2.
- **Twitch dock pop-out button passes the click event to `open`:** already ignored (string-only override). Covered by existing tests.

---

### Task 1: `ChatDock` takes a kind

**Files:** Modify `src/components/chat/ChatDock.tsx`; Test `src/components/chat/__tests__/ChatDock.youtube.test.tsx`

**Interfaces:** Produces `ChatDock({ channel, player, kind?: ChatKind })`.

- [ ] Step 1: Failing tests: with `kind="youtube"` and `channel="v:abcdefghijk@UC1"` the dock shows a frame titled `YouTube live chat`; `useChatPopout` is called with `(channel, undefined, 'youtube')`; no `Pop out YouTube chat` button even when a link exists for that string; default kind still renders the Twitch chat (`ChatSource` default).
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement: thread `kind` into `useChatPopout`, both `ChatSource`s; `useYoutubeChatPopout(kind === 'twitch' ? channel : undefined)`.
- [ ] Step 4: Run `src/components/chat` — PASS.
- [ ] Step 5: Commit `feat(chat): ChatDock can hold a YouTube chat`.

### Task 2: The YouTube player page docks chat for a live video

**Files:** Modify `src/pages/YoutubePlayerPage.tsx`; Test `src/pages/__tests__/YoutubePlayerPage.live.test.tsx` (same mocks as `YoutubePlayerPage.test.tsx`; `ChatDock` mocked to render its `player` plus `data-testid="chat-dock"` and its props as data attributes)

- [ ] Step 1: Failing tests: `live.state 'live'` → `chat-dock` with `kind="youtube"` and channel `v:abcdefghijk@UC1`, the player inside it, no `VideoPopoutBar` (no "Pop out video" bar text); `'none'` / `'upcoming'` → no dock, bar present; status `'loading'` → no `player` yet, "Loading video..." shown; status `'unavailable'` → player in today's box; empty `channelId` → channel `v:abcdefghijk`; live + topic picked → topic grid in the dock's slot; live + floating → dock gets the FloatingPanel-free player slot (page does not render `FloatingPanel` itself).
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement: `const live = data?.live.state === 'live'`; `const detailsKnown = pageStatus !== 'loading'`; build `playerSlot` (topic grid / floating panel only when NOT docked / `PlayerHost` only when `detailsKnown` and the app holds this address / loading box). Live: render `<ChatDock kind="youtube" channel={target} player={playerSlot} />` above a `max-w-5xl` column holding everything else; no `VideoPopoutBar`. Not live: today's markup, with the `detailsKnown` gate on `PlayerHost`. Fix existing page tests that assumed the player mounts while details load (report each).
- [ ] Step 4: Run `src/pages src/components/chat` — PASS.
- [ ] Step 5: Commit `feat(youtube): live videos show their chat in the Twitch page's dock`.

### Task 3: Verify and ship

- [ ] typecheck, lint, full `src` suite; dev-server check on a live video (`/youtube/<live id>`): dock and chat frame present, player started once; a non-live video unchanged.
- [ ] CLAUDE.md line for the YouTube player page; commit, push, PR.
