# Link Twitch from the YouTube Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The YouTube player page can make, edit and remove the same Twitch–YouTube link the Twitch page makes.

**Architecture:** Pure helpers parse a Twitch address and find one in a description; `linkedAccounts.ts` gains a
YouTube-side save/remove that keeps "one YouTube channel per Twitch record and one Twitch record per YouTube channel".
A `LinkTwitchModal` mirrors `LinkAccountsModal` (Twitch lookup via `getUserInfo`, YouTube description via
`fetchYoutubeChannel({ channelId })`, `isMutual`). A `LinkTwitch` row (button + free suggestion) sits in `VideoMeta`
beside `AlsoOnTwitch`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (`node ./node_modules/vitest/vitest.mjs run <path>`).

**Spec:** `docs/superpowers/specs/2026-11-22-youtube-link-twitch-design.md`

## Global Constraints

- One list: `src/lib/linkedAccounts.ts` records (`LinkRecord`), keyed by lower-case Twitch login.
- No API call before a click; on save: one `getUserInfo(login)` and one `fetchYoutubeChannel({ channelId })` (1 unit).
- Never save without Twitch confirming the channel exists.
- Not signed in to Twitch (`useTwitchAuth().isAuthenticated === false`): copy `Sign in to Twitch to link this channel.` and a sign-in button; no save.
- Replace warning copy: `<login> is linked to <other title> on YouTube. Save to replace it.`

## Review Focus

- **Twitch session expired during save** (`SessionExpiredError`): treat as signed out (show the sign-in copy), never a crash. Test in Task 2.
- **YouTube lookup fails (quota/error) but Twitch succeeded:** save as the viewer's claim (`confirmed: false`) using the title from the page, so quota never blocks linking. Test in Task 2.
- **Description with `twitch.tv/videos/123` or `twitch.tv/directory`:** not offered as a channel. Test in Task 1.
- **Typing a name in a different case (`Lofi_Girl`):** stored lower case; the "Also on Twitch" chip and the Twitch page find it. Test in Task 1.
- **Same channel re-saved (edit with the same login):** no duplicate record, Kick kept. Test in Task 1.

---

### Task 1: Pure helpers and the YouTube-side store operations

**Files:**
- Create: `src/lib/parseTwitchLink.ts`; Test `src/lib/__tests__/parseTwitchLink.test.ts`
- Modify: `src/lib/linkedAccounts.ts`, `src/config/storageKeys.ts`; Test `src/lib/__tests__/linkedAccounts.youtubeSide.test.ts`

**Interfaces — Produces:**
- `parseTwitchLogin(input: string): string | null` — bare name (`/^[A-Za-z0-9_]{3,25}$/`, optional leading `@`), or an http(s) URL on `twitch.tv` / `www.twitch.tv` / `m.twitch.tv` whose first path segment is a login and not reserved (`videos, directory, settings, search, downloads, jobs, turbo, subscriptions, wallet, inventory, drops, friends, messages, p, team, popout, moderator, u`). Returns lower case.
- `firstTwitchMention(text: string): string | null` — the first `twitch.tv/<segment>` in free text that `parseTwitchLogin` accepts.
- `linkYoutubeToTwitch(login: string, youtube: { channelId: string; title: string; handle?: string }, confirmed: boolean): void`
- `unlinkYoutube(channelId: string): void`
- `isYoutubeSuggestionDismissed(channelId: string): boolean`, `dismissYoutubeSuggestion(channelId: string): void` (key `LOCAL_LINK_DISMISSED_YOUTUBE: 'prism_link_dismissed_youtube'`)

- [ ] **Step 1: Failing tests**
  - `parseTwitchLogin`: `'twitch.tv/Lofi_Girl'`, `'https://www.twitch.tv/lofi_girl?x=1'`, `'@lofi_girl'`, `'lofi_girl'` → `'lofi_girl'`; `'twitch.tv/videos/123'`, `'twitch.tv/directory'`, `'https://youtube.com/@x'`, `'javascript:alert(1)'`, `''`, `'a b'` → `null`.
  - `firstTwitchMention('Follow me: https://twitch.tv/videos/1 and twitch.tv/Foo_Bar!')` → `'foo_bar'`; no address → `null`.
  - `linkYoutubeToTwitch('Foo', yt, true)` → `findByTwitch('foo')` has that youtube, `confirmed: true`.
  - Existing `{twitch:'foo', kick:{slug:'k'}}` → after link, record keeps `kick`, one record only.
  - YouTube `UC1` linked to `old` (with Kick) then `linkYoutubeToTwitch('new', {channelId:'UC1',…})` → `findByYoutube('UC1').twitch === 'new'`; `old` record still exists with kick and no youtube. Same with `old` without Kick → `old` record gone.
  - `unlinkYoutube('UC1')` → `findByYoutube('UC1') === null`; a Kick-only remainder is kept.
  - Dismiss: `dismissYoutubeSuggestion('UC1')` → `isYoutubeSuggestionDismissed('UC1')` true, `'UC2'` false.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/parseTwitchLink.test.ts src/lib/__tests__/linkedAccounts.youtubeSide.test.ts` — FAIL (missing exports).
- [ ] **Step 3: Implement.** Store ops build on `getLinks()` / the private `write()`, a record without `youtube` and without `kick` is dropped; `linkedAt: Date.now()`; new record goes to the front (as `saveLink`).
- [ ] **Step 4: Run** the same command plus `src/lib/__tests__/linkedAccounts*.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(links): YouTube-side link helpers`.

### Task 2: `LinkTwitchModal`

**Files:** Create `src/components/youtube/LinkTwitchModal.tsx`; Test `src/components/youtube/__tests__/LinkTwitchModal.test.tsx` (mock `../../lib/twitchApi` `getUserInfo`, `../../lib/youtubeChannelApi` `fetchYoutubeChannel`, `../../hooks/useTwitchAuth`)

**Interfaces:** Consumes Task 1. Produces `LinkTwitchModal({ channelId, channelTitle, suggested?, onClose }: { channelId: string; channelTitle: string; suggested?: string; onClose: () => void })`.

Same shell as `LinkAccountsModal` (dialog `aria-label="Link Twitch"`, Esc / backdrop close, `Check and save`, `Cancel`, `Remove link` when linked). Title `Link Twitch for <channelTitle>`. Input label `Their Twitch channel`, placeholder `https://www.twitch.tv/name`, starts with the existing link's login, else `suggested`, else empty.

- [ ] **Step 1: Failing tests**
  - Signed out → `Sign in to Twitch to link this channel.` and a `Sign in with Twitch` button calling `login`; `Check and save` absent.
  - Unparseable text → alert `That doesn't look like a Twitch channel. Use twitch.tv/name or just the name.`; no lookup.
  - `getUserInfo` rejects `Error('User not found')` → alert `No Twitch channel found for that name.`; nothing saved.
  - `getUserInfo` rejects `SessionExpiredError` → sign-in copy shown; nothing saved.
  - Mutual bios (Twitch description has `youtube.com/channel/UC1…`, YouTube description has `twitch.tv/foo`) → saved `confirmed: true`, `onClose` called.
  - Not mutual → saved `confirmed: false`.
  - `fetchYoutubeChannel` returns `{status:'error'}` → saved `confirmed: false` with `title` = `channelTitle`.
  - Twitch `foo` already linked to `UC9` "Other" → after typing `foo` and the first submit, alert-free notice `foo is linked to Other on YouTube. Save to replace it.`, nothing saved; second submit saves.
  - Linked → `Remove link` calls through to `unlinkYoutube('UC1')` and closes.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/youtube/__tests__/LinkTwitchModal.test.tsx` — FAIL.
- [ ] **Step 3: Implement.** Lookups in parallel after parsing; saves via `linkYoutubeToTwitch(user.login, { channelId, title, handle? }, isMutual(...))`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(youtube): Link Twitch box`.

### Task 3: The button and suggestion on the player page

**Files:** Create `src/components/youtube/LinkTwitch.tsx`; Modify `src/components/youtube/VideoMeta.tsx`; Test `src/components/youtube/__tests__/LinkTwitch.test.tsx`

**Interfaces:** Produces `LinkTwitch({ channelId, channelTitle, description }: { channelId: string; channelTitle: string; description: string })`. `VideoMeta` renders it right after `<AlsoOnTwitch>` when `data.channelId` is non-empty.

Button drawn like the Twitch side's (`prism-pill`, `PrismMark`), text `Link Twitch` / `Edit links` (via `useLinkedByYoutube`). Suggestion (only unlinked and not dismissed): `Possibly twitch.tv/<name>?` opening the modal with `suggested=<name>`, × button `aria-label="Not them"` calling `dismissYoutubeSuggestion`.

- [ ] **Step 1: Failing tests:** unlinked → `Link Twitch`; linked → `Edit links` and no suggestion; description `… twitch.tv/foo_bar …` → `Possibly twitch.tv/foo_bar?`; clicking it opens the dialog with input value `foo_bar`; × hides it and it stays hidden on re-render; no `twitch.tv` in description → no suggestion; a `VideoMeta` test: `Link Twitch` present with a channelId, absent with `channelId: ''`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/youtube` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `src/components/youtube src/pages` — PASS.
- [ ] **Step 5: Commit** `feat(youtube): Link Twitch from the player page`.

### Task 4: Verify and ship

- [ ] typecheck, lint, full `src` suite; dev server: on a YouTube video, link a Twitch name, see "Also on Twitch", open that Twitch page and see "Also on YouTube"; remove it.
- [ ] CLAUDE.md line (linking from both pages); commit, push, PR.
