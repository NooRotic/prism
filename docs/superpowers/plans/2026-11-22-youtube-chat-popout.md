# YouTube Chat Pop-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a Twitch channel page whose streamer has a linked YouTube account, a "Pop out YouTube chat" button opens YouTube's own live chat in a second window that sits beside the Twitch chat pop-out, and follows the Twitch page.

**Architecture:** The existing chat pop-out machinery (`chatPopout.ts`, `useChatPopout`, `ChatPopoutPage`) gains a `kind: 'twitch' | 'youtube'`. Each kind has its own window name, BroadcastChannel name, saved bounds and route, so the two windows never see each other's messages; Twitch's values stay exactly as today. For YouTube, the "channel" the bus carries is an encoded target (`v:<videoId>`, `none:<name>`, `looking`), so the existing hello / set-channel / close flow is reused unchanged. The window must open inside the click (popup blockers), so it opens at `looking` and the page sends the found target afterwards.

**Tech Stack:** React 19, React Router, TypeScript, Vitest + Testing Library. Tests: `node ./node_modules/vitest/vitest.mjs run <path>`.

**Spec:** `docs/superpowers/specs/2026-11-22-youtube-chat-popout-design.md`

**Depends on:** the rail plan (`2026-11-22-youtube-rail-auto-check.md`) for `readLiveLast()` (Task 3 here). Build that first.

## Global Constraints

- Twitch pop-out behaviour, names and storage keys unchanged: window and bus `prism-chat-popout`, bounds `prism_chat_popout_bounds`, route `/chat/:channel`.
- YouTube: window and bus `prism-chat-popout-youtube`, bounds key `LOCAL_YOUTUBE_CHAT_POPOUT_BOUNDS: 'prism_youtube_chat_popout_bounds'`, route `/chat-youtube/:target`.
- Embed URL exactly `https://www.youtube.com/live_chat?v=<videoId>&embed_domain=<window.location.hostname>`.
- A lookup costs exactly 2 API calls (`playlistItems` + `videos`), no `channels` call. Reuse the rail's answer (0 calls) when it lists the channel live and `checkedAt` is within 15 minutes (Claude's call: older answers may name an ended stream).
- Units are spent only on the button click or on the Twitch page moving to another channel while the YouTube window is open.
- No message polling, no own renderer, no Google write scope.

**How spec goal 4 is met:** instead of a platform field on every message, each kind has its own BroadcastChannel, so a window never even receives the other platform's messages. Same effect, and the Twitch message format is untouched.

**Deviation from the spec, to tell the owner:** spec goal 5 says the button reports "not live" instead of opening a window. A popup can only open inside the click, before the lookup answers, so the window opens and shows "<name> isn't live on YouTube right now" with a Close button. Only a fresh rail answer could know sooner, and it only knows live channels.

## Review Focus

- **The page posts the found target before the new window is listening:** the message would be lost and the window would say "Looking…" forever. `useChatPopout` re-sends `set-channel` whenever a `hello` names a different channel than the current one. Test in Task 2.
- **Twitch and YouTube windows both open, Twitch page switches channel:** only the YouTube window gets a YouTube target, the Twitch window only a Twitch login. Test in Task 2.
- **Quota reached or network error during the lookup:** the window shows a plain sentence ("Couldn't reach YouTube" / "PRISM has used up YouTube's daily limit") instead of "Looking…". Test in Task 3.
- **The link is removed while the YouTube window is open:** the window shows `none:<twitch name>`; the button disappears. Test in Task 4.
- **A reload of the Twitch page with the YouTube window open:** it re-attaches through `ping`/`hello` like the Twitch pop-out (the target stays in the window's URL). Test in Task 2.

---

### Task 1: Per-kind pop-out names + YouTube target encoding

**Files:**
- Modify: `src/lib/chatPopout.ts`
- Modify: `src/config/storageKeys.ts` (add `LOCAL_YOUTUBE_CHAT_POPOUT_BOUNDS`)
- Create: `src/lib/youtubeChatTarget.ts`
- Test: `src/lib/__tests__/chatPopout.test.ts`, `src/lib/__tests__/youtubeChatTarget.test.ts`

**Interfaces:**
- Produces in `chatPopout.ts`:
  - `type ChatKind = 'twitch' | 'youtube'`
  - `popoutNames(kind: ChatKind): { windowName: string; busName: string; boundsKey: string; path: string }` (`path` is `/chat` or `/chat-youtube`)
  - `createPopoutBus(kind: ChatKind = 'twitch')`, `loadBounds(kind = 'twitch')`, `saveBounds(bounds, kind = 'twitch')`, `buildPopoutUrl(channel, owner, kind = 'twitch')` — defaults keep every current caller and test unchanged. `POPOUT_WINDOW_NAME` stays exported.
- Produces in `youtubeChatTarget.ts`:
  - `type YoutubeChatTarget = { kind: 'looking' } | { kind: 'video'; videoId: string } | { kind: 'none'; name: string } | { kind: 'failed'; reason: 'quota' | 'error' }`
  - `encodeTarget(t: YoutubeChatTarget): string` → `looking`, `v:<id>`, `none:<name>`, `failed:quota|error`
  - `decodeTarget(s: string): YoutubeChatTarget` — anything unrecognised → `{ kind: 'looking' }`; a videoId must match `/^[A-Za-z0-9_-]{11}$/` else `looking`
  - `youtubeChatEmbedUrl(videoId: string, host: string): string`

- [ ] **Step 1: Write the failing tests:** `popoutNames('twitch')` equals the current values exactly; `popoutNames('youtube')` equals the Global Constraints values; `buildPopoutUrl('v:abcdefghijk','t1','youtube') === '/chat-youtube/v%3Aabcdefghijk?owner=t1'`; `saveBounds(b,'youtube')` does not change `loadBounds('twitch')`; encode/decode round-trip for all four kinds; `decodeTarget('v:bad')` → looking; `none:` with a name containing `:` round-trips; `youtubeChatEmbedUrl('abcdefghijk','prism.nooroticx.tv')` equals `https://www.youtube.com/live_chat?v=abcdefghijk&embed_domain=prism.nooroticx.tv`.
- [ ] **Step 2: Run** both test files — Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: Run** them plus `src/components/chat src/pages/__tests__/ChatPopoutPage.test.tsx` — Expected: PASS (existing Twitch tests untouched).
- [ ] **Step 5: Commit** `feat(chat): per-platform pop-out names and the YouTube chat target`

### Task 2: `useChatPopout` and `ChatPopoutPage` take a kind; YouTube chat renders

**Files:**
- Modify: `src/components/chat/useChatPopout.ts`
- Modify: `src/pages/ChatPopoutPage.tsx`
- Modify: `src/components/chat/ChatSource.tsx`
- Create: `src/components/chat/YoutubeChatEmbed.tsx`
- Modify: `src/AppRoutes.tsx` (add `<Route path="chat-youtube/:target" element={<ChatPopoutPage kind="youtube" />} />` beside the Twitch one)
- Test: `src/components/chat/__tests__/useChatPopout.test.ts(x)` (existing file if present), `src/pages/__tests__/ChatPopoutPage.test.tsx`, `src/components/chat/__tests__/ChatSource.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `useChatPopout(channel: string | undefined, injectedBus?: PopoutBus, kind: ChatKind = 'twitch')`; `open(channelOverride?: string)` — uses the override when given (the YouTube hook knows its target only in the same click).
  - `ChatPopoutPage({ bus?, kind = 'twitch' })` — reads `:channel` (twitch) or `:target` (youtube), navigates within its own `path` on `set-channel`, saves bounds per kind; `document.title` is `<channel> chat` for Twitch and `YouTube chat` for YouTube.
  - `ChatSource({ channel, kind = 'twitch' })` — youtube decodes the target: `video` → `<YoutubeChatEmbed videoId>`; `looking` → "Looking for the YouTube stream…"; `none` → "<name> isn't live on YouTube right now"; `failed` → "Couldn't reach YouTube." or "PRISM has used up YouTube's daily limit; try again tomorrow." The non-video states also show a Close button (`window.close()`).
  - `YoutubeChatEmbed({ videoId })` — an iframe, `title="YouTube live chat"`, `src={youtubeChatEmbedUrl(videoId, window.location.hostname)}`, full size.

- [ ] **Step 1: Write the failing tests:**
  - hook: with `kind='youtube'`, `window.open` is called with the `/chat-youtube/...` URL and name `prism-chat-popout-youtube`; `open('v:abcdefghijk')` uses the override.
  - hook (Review Focus 1): after `open`, change `channel` from `looking` to `v:abcdefghijk` BEFORE any hello → a `set-channel` is posted; then a `hello` arrives naming `looking` → `set-channel` with `v:abcdefghijk` is posted again. A hello naming the current channel posts nothing.
  - hook (Review Focus 2): two hooks, kinds twitch and youtube, each with its own injected bus; a twitch channel change posts only on the twitch bus.
  - page: `kind="youtube"` at `/chat-youtube/v%3Aabcdefghijk?owner=o` renders an iframe whose src is the embed URL; a `set-channel` to `none:Some%20One` navigates to `/chat-youtube/none%3ASome%20One?owner=o` and shows the not-live sentence; it posts `hello` with the target on load (re-attach, Review Focus 5).
  - ChatSource: each of the four target kinds renders its text / iframe.
- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement.** In the hook's `hello` handler, compare `msg.channel` with the latest channel (keep it in a ref) and post `set-channel` when they differ.
- [ ] **Step 4: Run** them and `node ./node_modules/vitest/vitest.mjs run src/components/chat src/pages` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): a YouTube chat pop-out window beside the Twitch one`

### Task 3: Finding the linked channel's live video

**Files:**
- Modify: `src/lib/youtubeLive.ts` — `fetchLiveSubscriptions(channels, opts: { avatars?: boolean } = {})`; `avatars: false` skips the `channels` call
- Create: `src/lib/youtubeChatLookup.ts`
- Test: `src/lib/__tests__/youtubeLive.test.ts`, `src/lib/__tests__/youtubeChatLookup.test.ts`

**Interfaces:**
- Consumes: rail plan's `readLiveLast()`; Task 1's `YoutubeChatTarget`.
- Produces: `findYoutubeChatTarget(link: { channelId: string; title: string }, now = Date.now()): Promise<YoutubeChatTarget>` — never throws; returns `video` / `none` (name = `link.title`) / `failed`.
  - `fastYoutubeChatTarget(link, now = Date.now()): YoutubeChatTarget | null` — synchronous: `video` from the rail answer when it lists `link.channelId` and `checkedAt` is within 15 min; otherwise null.

- [ ] **Step 1: Write the failing tests:** `avatars:false` → no `channels` request (existing tests still expect it by default); lookup makes exactly 2 calls (`playlistItems`, `videos`) for a live channel and returns `{kind:'video', videoId}`; not live → `{kind:'none', name: link.title}`; quota → `{kind:'failed', reason:'quota'}`; error → `failed: error`; fast path: fresh rail answer → video with 0 fetches; `checkedAt` 16 min old or null → null.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: `findYoutubeChatTarget` = `fastYoutubeChatTarget(...) ?? ` result of `fetchLiveSubscriptions([{ id: link.channelId, title: link.title }], { avatars: false })` mapped to a target.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(youtube): find a linked channel's live video for its chat (2 units)`

### Task 4: The button on the Twitch page

**Files:**
- Create: `src/components/chat/useYoutubeChatPopout.ts`
- Modify: `src/components/chat/ChatHeader.tsx` (optional prop `youtubeChat?: { onClick: () => void } | null`; a button `aria-label="Pop out YouTube chat"`, `title="Pop out this streamer's YouTube chat"`, YouTube-red icon, placed right after "Pop out chat")
- Modify: `src/components/chat/ChatDock.tsx` (both `ChatHeader` uses)
- Test: `src/components/chat/__tests__/useYoutubeChatPopout.test.tsx`, `src/components/chat/__tests__/ChatHeader.test.tsx` (or the existing ChatDock tests)

**Interfaces:**
- Consumes: `useLinkedAccount(login)`; Task 2 `useChatPopout(..., 'youtube')`; Task 3 `fastYoutubeChatTarget`, `findYoutubeChatTarget`; Task 1 `encodeTarget`.
- Produces: `useYoutubeChatPopout(twitchLogin: string | undefined): { available: boolean; isOpen: boolean; blocked: boolean; open: () => void }`
  - `available` = the link has `youtube`.
  - `open()`: `const fast = fastYoutubeChatTarget(link)`; set target state and call `popout.open(encodeTarget(fast ?? { kind: 'looking' }))` synchronously; if no fast target, `await findYoutubeChatTarget(link)` then set the target (the hook's channel-change effect sends it).
  - While `isOpen`, when `twitchLogin` changes: new link with youtube → set `looking`, then look up; no link → `none:<twitchLogin>`. A lookup whose login is no longer current is discarded.

- [ ] **Step 1: Write the failing tests:** no link → `available false`, no button in ChatHeader; with a link, clicking opens a window (mock `window.open`) before any fetch resolves; after the lookup resolves the bus gets `set-channel` with `v:<id>`; Twitch login change while open → one new lookup; while closed → no lookup; link removed while open → `none:<login>` (Review Focus 4); a stale lookup resolving after a login change is ignored.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; wire `youtubeChat={yt.available ? { onClick: yt.open } : null}` in `ChatDock`.
- [ ] **Step 4: Run** `node ./node_modules/vitest/vitest.mjs run src/components/chat` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): Pop out YouTube chat button for linked streamers`

### Task 5: Verify on prod and ship

- [ ] **Step 1:** typecheck, lint, full suite (re-run once on the `UNKNOWN ... aria-query` flake).
- [ ] **Step 2:** Dev server check: link a Twitch channel to a currently live YouTube channel, click the button → window opens, embed loads (read-only is enough locally).
- [ ] **Step 3:** CLAUDE.md: add the YouTube chat pop-out to the chat line (`youtubeChatTarget.ts`, `youtubeChatLookup.ts`, `useYoutubeChatPopout.ts`, `/chat-youtube/:target`). Commit, push, open PR.
- [ ] **Step 4 (owner, after merge):** on prod, signed in to YouTube in Chrome, open both pop-outs for a simulcasting streamer; check that reading AND posting work in the YouTube window. If posting fails, report it; the fallback (an "Open chat on YouTube" link) is a follow-up, not a workaround.

## Ideas (not in scope)

- The same button on `OfflineLayout` (Twitch offline, YouTube live).
- A docked (not popped-out) YouTube chat tab in `ChatDock`.
