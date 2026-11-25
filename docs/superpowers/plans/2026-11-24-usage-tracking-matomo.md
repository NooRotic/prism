# Usage tracking with Matomo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matomo shows every page change and, by name, which streams, channels and linked accounts are used in PRISM.

**Architecture:** One sender (`src/lib/analytics.ts`) pushes to `window._paq`, which exists only where the block in `index.html`
allows counting. A pure table (`src/lib/analyticsPage.ts`) decides what address is sent. `usePageView` sends page views; pages and
components send events with one line each. No server change.

**Tech Stack:** React 19, react-router-dom, TypeScript, Vitest + Testing Library (jsdom), Matomo 5 JS tracker.

**Spec:** `docs/superpowers/specs/2026-11-24-usage-tracking-matomo-design.md`

## Global Constraints

- Starts from `main` with NooRotic/prism#134 merged; if it is still open, merge `fix/matomo-address-fragment` into the branch first.
- Never sent to Matomo: query strings (except `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` on the first page
  view), fragments, pasted stream addresses, search words, account names.
- Every tracking call is best effort and never throws.
- Counting only where `window._paq` exists. Do Not Track and Global Privacy Control handling in the block does not change.
- `usePageHit`, `usageApi` and `server/` are not touched.
- Commit messages carry no Co-Authored-By line (it goes in the PR description). Never commit to `main`.
- Tests: `node ./node_modules/vitest/vitest.mjs run <file>` (not `npx`). Types: `node ./node_modules/typescript/bin/tsc -b`. Lint:
  `node ./node_modules/eslint/bin/eslint.js <files>`.
- Code comments explain why, in the file's existing style; lines up to about 130 characters.

## Review Focus

1. Reloading `/hls-dash/custom?url=<secret>`: the browser's referrer is PRISM's own full address, so an empty referrer is sent. (Task 2)
2. The pop-out player frame (`/popout/player?...url=`), chat pop-outs and `/admin`: no page view and no link tracking. (Task 2)
3. Storage blocked (private window): the 404 redirect still redirects and the first page view is still sent. (Task 2)
4. Retry, or a rebuffer, on one stream: "played" and "failed" are each sent once; "Try as DASH" keeps the stream's name. (Task 3)
5. Moving between videos before the first one's details arrive: one "opened" per video, with its own channel. (Task 4)

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/analytics.ts` (new) | Push page views and events to `_paq`; build a link's name |
| `src/lib/analyticsPage.ts` (new) | Path to `{ path, title }` or null; which `utm_` parameters survive |
| `src/hooks/usePageView.ts` (new) | One page view per path change; first-view referrer and `utm_` |
| `src/hooks/useStayed.ts` (new) | "Stayed" events at 1 and 10 minutes |
| `index.html`, `public/404.html` | Settings only; keep the real referrer across the redirect |
| Call sites | `HlsPage`, `StreamPlayerPanel`, `DashJSPlayer`, `StreamStatus`, `TwitchPlayerPage`, `YoutubePlayerPage`, `useLinkSuggestion`, `LinkAccountsModal`, `LinkTwitchModal`, `LinkedAccounts`, `useYoutubeChatPopout`, `useChatPopout`, `FloatingVideoProvider`, `SmartUrlInput` |
| `CountedNote.tsx`, `config/analytics.ts`, `index.css`, `AccountsRow.tsx` | The notice, two versions, two places |

---

### Task 1: The sender and the address table

**Files:**
- Create: `src/lib/analytics.ts`, `src/lib/analyticsPage.ts`
- Test: `src/lib/__tests__/analytics.test.ts`, `src/lib/__tests__/analyticsPage.test.ts`

**Interfaces:**
- Produces:
  - `trackPage(view: { path: string; title: string; query?: string; referrer?: string }): void`
  - `startLinkTracking(): void`
  - `trackEvent(category: EventCategory, action: string, name?: string): void` with
    `type EventCategory = 'HLS / DASH' | 'Twitch' | 'YouTube' | 'Linking' | 'Feature' | 'Stayed'`
  - `linkName(link: { twitch: string; youtube?: { title: string }; kick?: { slug: string } }): string`
  - `PASTED_STREAM = 'Pasted address'`
  - `analyticsPage(pathname: string): { path: string; title: string } | null`
  - `campaignQuery(search: string): string` (`''`, or `?utm_...`)

- [ ] **Step 1: Make this worktree's own `node_modules`.** It is a link to the main checkout's, so Vite refuses `flag-icons` and 8 test
  files cannot load. Remove only the link (`cmd /c rmdir node_modules`, never recursively), then `pnpm install --frozen-lockfile`.
  Check: `node ./node_modules/vitest/vitest.mjs run src/components/streams/__tests__/AboutPanel.test.tsx` passes.

- [ ] **Step 2: Write the failing tests**

```ts
// analyticsPage.test.ts
it.each([
  ['/', '/', 'Home'],
  ['/twitch', '/twitch', 'Twitch'],
  ['/twitch/', '/twitch', 'Twitch'],
  ['/twitch/Shroud', '/twitch/shroud', 'Twitch channel'],
  ['/twitch/not a login', '/twitch/other', 'Twitch: other'],
  ['/youtube', '/youtube', 'YouTube'],
  ['/youtube/catchup', '/youtube/catchup', 'YouTube: Catch up'],
  ['/youtube/dQw4w9WgXcQ', '/youtube/dQw4w9WgXcQ', 'YouTube video'],
  ['/youtube/https%3A%2F%2Fexample.test%2Fa%3Fkey%3Dsecret', '/youtube/other', 'YouTube: other'],
  ['/hls-dash', '/hls-dash', 'HLS / DASH'],
  ['/hls-dash/custom', '/hls-dash/custom', 'HLS / DASH: pasted address'],
  ['/hls-dash/0123456789ab', '/hls-dash/0123456789ab', 'HLS / DASH stream'],
  ['/hls-dash/bbb-hls', '/hls-dash/bbb-hls', 'HLS / DASH stream'],
  ['/hls-dash/whatever', '/hls-dash/other', 'HLS / DASH: other'],
  ['/import', '/import', 'Import'],
  ['/token=secret', '/not-found', 'Not found'],
  ['/twitch/a/b', '/not-found', 'Not found'],
])('sends %s as %s (%s)', (pathname, path, title) => expect(analyticsPage(pathname)).toEqual({ path, title }))

it.each(['/admin', '/admin/usage', '/chat/shroud', '/chat-youtube/v:abc@UC1', '/popout/player'])('sends nothing for %s', (p) =>
  expect(analyticsPage(p)).toBeNull())

it('keeps the five campaign tags and nothing else', () => {
  expect(campaignQuery('?url=https%3A%2F%2Fx.test%2Fa&utm_source=linkedin&utm_content=post-prism&q=words')).toBe(
    '?utm_source=linkedin&utm_content=post-prism')
  expect(campaignQuery('?url=x')).toBe('')
})

// analytics.test.ts (window._paq is deleted after each test)
it('does nothing where counting is off', () => {
  expect(() => { trackPage({ path: '/', title: 'Home' }); trackEvent('Twitch', 'opened', 'shroud'); startLinkTracking() }).not.toThrow()
  expect(window._paq).toBeUndefined()
})
it('never throws when the tracker does', () => {
  window._paq = { push: () => { throw new Error('boom') } }
  expect(() => trackEvent('Twitch', 'opened', 'shroud')).not.toThrow()
})
it('sends a page view with the given address only', () => {
  window._paq = []
  trackPage({ path: '/hls-dash/custom', title: 'HLS / DASH: pasted address', query: '?utm_source=x', referrer: '' })
  expect(window._paq).toEqual([
    ['setReferrerUrl', ''],
    ['setCustomUrl', `${location.origin}/hls-dash/custom?utm_source=x`],
    ['setDocumentTitle', 'HLS / DASH: pasted address'],
    ['trackPageView'],
  ])
})
it('leaves the referrer alone when none is given', () => {
  window._paq = []
  trackPage({ path: '/', title: 'Home' })
  expect(window._paq.map(([name]) => name)).toEqual(['setCustomUrl', 'setDocumentTitle', 'trackPageView'])
})
it('sends an event with and without a name', () => {
  window._paq = []
  trackEvent('Twitch', 'opened', 'shroud')
  trackEvent('Feature', 'chat pop-out')
  expect(window._paq).toEqual([['trackEvent', 'Twitch', 'opened', 'shroud'], ['trackEvent', 'Feature', 'chat pop-out']])
})
it.each([
  [{ twitch: 'x', youtube: { title: 'Y' } }, 'twitch/x <-> youtube/Y'],
  [{ twitch: 'x', kick: { slug: 'k' } }, 'twitch/x <-> kick/k'],
  [{ twitch: 'x', youtube: { title: 'Y' }, kick: { slug: 'k' } }, 'twitch/x <-> youtube/Y + kick/k'],
])('names a link', (link, name) => expect(linkName(link)).toBe(name))
```

- [ ] **Step 3: Run both; expected: FAIL, modules not found**

- [ ] **Step 4: Implement both files.** `window._paq` is declared on `Window` as `{ push(entry: unknown[]): unknown }` (optional):
  Matomo replaces the array with its own object once it loads. Reuse `normalisePath` (`usageApi`), `getDemoById` (only demos whose
  protocol fits the section: `youtube`, or `hls` / `dash`) and `CUSTOM_STREAM_ID`.

- [ ] **Step 5: Run both; expected: PASS. Then types and lint. Commit** `feat(analytics): the sender and the table of addresses that may be sent`

---

### Task 2: Page views

**Files:**
- Create: `src/hooks/usePageView.ts`
- Modify: `index.html` (Matomo block), `public/404.html`, `src/App.tsx` (`HitReporter`), `src/config/storageKeys.ts`
- Test: `src/hooks/__tests__/usePageView.test.tsx`, `src/lib/__tests__/matomoBlock.test.ts`, `src/__tests__/notFoundRedirect.test.ts`

**Interfaces:**
- Consumes: `trackPage`, `startLinkTracking`, `analyticsPage`, `campaignQuery` (Task 1).
- Produces: `usePageView(): void`; `STORAGE_KEYS.SESSION_ENTRY_REFERRER = 'prism_entry_referrer'`.

- [ ] **Step 1: Write the failing tests** (harness like `usePageHit.test.tsx`; `vi.mock('../../lib/analytics')`)

```ts
// usePageView.test.tsx: `views()` is the list of trackPage arguments
it('counts the page landed on, then every move to a different path')      // '/' -> '/twitch/a' -> '/twitch/b': three views, titles Home, Twitch channel x2
it('does not count a changed query or fragment, or a trailing slash')     // one view
it('sends campaign tags with the first view only')                       // '/?utm_source=linkedin&x=1' -> query '?utm_source=linkedin'; next view has no query
it('sends the referrer kept by the 404 redirect, once, and forgets it')   // sessionStorage 'https://www.linkedin.com/'; first view referrer equals it; key removed
it('sends an empty referrer when the browser says PRISM sent it')         // document.referrer = `${location.origin}/hls-dash/custom?url=https://x.test/secret` -> referrer ''
it('leaves another site’s referrer to Matomo')                            // document.referrer = 'https://www.google.com/' -> no `referrer` key in the first view
it('names the page before as the referrer of later views')               // second view referrer === `${location.origin}/` + first path, no query
it('sends nothing, and does not start link tracking, for a pop-out or admin page')   // '/popout/player?kind=stream&url=https%3A%2F%2Fx.test%2Fa'
it('starts link tracking once, with the first view')
it('still sends the first view when storage is blocked')                  // sessionStorage.getItem throws
```

```ts
// matomoBlock.test.ts: replace the trackPageView expectations
expect(r.paq).toContainEqual(['discardHashTag', true])
expect(r.paq!.map(([name]) => name)).not.toContain('trackPageView')
expect(r.paq!.map(([name]) => name)).not.toContain('enableLinkTracking')

// notFoundRedirect.test.ts: run the script in public/404.html (imported ?raw, as streamCheckerPage.test.ts does) with stand-ins
it('keeps another site’s referrer')                    // 'https://www.linkedin.com/feed' saved under prism_entry_referrer
it('keeps nothing when PRISM itself is the referrer')  // same host
it('keeps nothing when there is no referrer')
it('redirects to the same address with and without storage')   // setItem throws: l.replace still called with '/?/twitch/x&utm_source=a~and~utm_medium=b' form
```

- [ ] **Step 2: Run the three files; expected: FAIL**
- [ ] **Step 3: Implement.** The hook keeps the last path and the last sent address in refs. A null page sends nothing and does not use up
  the "first view". `HitReporter` calls `usePageHit()` then `usePageView()`. In `404.html` compare hosts with `new URL(...)` inside the
  same `try`. Update the block's comment to say the app sends the views and why.
- [ ] **Step 4: Run the three files plus `usePageHit.test.tsx`; expected: PASS. Types, lint. Commit** `feat(analytics): one page view per page change, with tidy addresses and the real referrer`

---

### Task 3: HLS / DASH streams

**Files:**
- Modify: `src/components/player/StreamPlayerPanel.tsx`, `src/components/player/DashJSPlayer.tsx` (`handlePlaying`),
  `src/components/player/StreamStatus.tsx` ("Open address" link), `src/pages/HlsPage.tsx`
- Test: `src/components/player/__tests__/StreamPlayerPanel.test.tsx`, `DashJSPlayer.log.test.tsx`, `StreamStatus.test.tsx`,
  `src/pages/__tests__/HlsPage.analytics.test.tsx` (new, with the `PlayerHost` stand-in from `HlsPage.player.test.tsx`)

**Interfaces:**
- Consumes: `trackEvent`, `PASTED_STREAM`.
- Produces: `StreamPlayerPanel` props `onStarted?: () => void` and `onFailed?: () => void`, each called at most once per mount.

- [ ] **Step 1: Write the failing tests**

```ts
// StreamPlayerPanel: 'calls onStarted once, however often the player reports playing (a rebuffer, a retry)'
// StreamPlayerPanel: 'calls onFailed once, also after a retry that fails again'
// DashJSPlayer: 'tells the page it is playing when the video starts' -> onPlaying called after a 'playing' event
// StreamStatus: 'keeps the address out of link tracking' -> the "Open address" link has class matomo_ignore

// HlsPage.analytics: events() = trackEvent calls in the 'HLS / DASH' and 'Feature' categories
'/hls-dash/bbb-hls' shown                 -> ['HLS / DASH', 'chosen', 'Big Buck Bunny']
  then play, play again                   -> one ['HLS / DASH', 'played', 'Big Buck Bunny']
  then fail                               -> one ['HLS / DASH', 'failed', 'Big Buck Bunny']
'/hls-dash' shown, play                   -> no 'chosen'; ['HLS / DASH', 'default played', 'Big Buck Bunny'] (the demo default)
'/hls-dash/custom?url=https://x.test/secret.m3u8', play, fail
                                          -> no 'chosen'; names are 'Pasted address'; JSON.stringify(all calls) has no 'x.test'
"Try as DASH" on a listed stream, play    -> 'played' with the listed stream's name
a listed id, while the list is loading    -> nothing until the list arrives, then one 'chosen'
star a stream                             -> ['Feature', 'favorite', name]; un-star -> nothing more
```

- [ ] **Step 2: Run; expected: FAIL**
- [ ] **Step 3: Implement.** The name is `playingEntry?.name ?? PASTED_STREAM`. "chosen" is an effect on the stream id and its name, only
  when `streamId` is set, is not `custom` and `playingEntry` exists. `onPlaying` in `DashJSPlayer` goes through its `cb` ref like the
  other callbacks. Wrap `toggleFavorite` in the page, where the name is known.
- [ ] **Step 4: Run those files plus `HlsPage.test.tsx`, `HlsPage.player.test.tsx`, `HlsPage.popout.test.tsx`, `StreamPreview.test.tsx`; expected: PASS. Types, lint. Commit** `feat(analytics): which HLS / DASH streams are chosen, played and failed`

---

### Task 4: Channels opened, and how long people stay

**Files:**
- Create: `src/hooks/useStayed.ts`
- Modify: `src/pages/TwitchPlayerPage.tsx`, `src/pages/YoutubePlayerPage.tsx`, `src/pages/HlsPage.tsx`
- Test: `src/hooks/__tests__/useStayed.test.tsx`, `src/pages/__tests__/TwitchPlayerPage.analytics.test.tsx`,
  `src/pages/__tests__/YoutubePlayerPage.analytics.test.tsx`, `HlsPage.analytics.test.tsx`

**Interfaces:**
- Consumes: `trackEvent`, `PASTED_STREAM`, `useFloatingVideo().isFloating`.
- Produces: `useStayed(name: string | null, floating: boolean): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// useStayed (fake timers)
it('reports 1 min and 10 min, once each')             // after 60 s: ['Stayed','1 min','shroud']; after 600 s: ['Stayed','10 min','shroud']; after 3600 s: nothing more
it('does not count time while the page is hidden')    // document.visibilityState 'hidden' for 5 min -> nothing
it('counts while hidden when the video is popped out')
it('starts again for another name')                   // 'a' for 50 s, then 'b': nothing at 60 s, 'b' after its own 60 s
it('counts nothing without a name')

// TwitchPlayerPage: /twitch/Shroud -> one ['Twitch','opened','shroud']; moving to /twitch/xqc -> one more; re-render -> nothing;
//   /twitch/not%20a%20login -> nothing
// YoutubePlayerPage: details arrive -> one ['YouTube','opened','Title (UC...)']; re-render with a fresh details object -> nothing;
//   no details -> nothing; leave video A before its details, B's arrive -> only B
// HlsPage Stayed names: chosen stream -> its name; default -> 'Big Buck Bunny (default)'; pasted -> 'Pasted address'
```

- [ ] **Step 2: Run; expected: FAIL**
- [ ] **Step 3: Implement.** `useStayed` adds up time in 5-second steps while `document.visibilityState === 'visible' || floating`.
  YouTube's name is `` `${channelTitle} (${channelId})` ``, or the title alone when the id is empty. Twitch names are the lower-cased
  login when it matches `/^[A-Za-z0-9_]{1,25}$/`, else null.
- [ ] **Step 4: Run those files plus the pages' existing tests; expected: PASS. Types, lint. Commit** `feat(analytics): Twitch and YouTube channels opened, and stays of 1 and 10 minutes`

---

### Task 5: Linked accounts

**Files:**
- Modify: `src/hooks/useLinkSuggestion.ts`, `src/components/channel/LinkAccountsModal.tsx`, `src/components/youtube/LinkTwitchModal.tsx`,
  `src/components/channel/LinkedAccounts.tsx`, `src/components/chat/useYoutubeChatPopout.ts`
- Test: `useLinkSuggestion.test.tsx`, `LinkedAccounts.test.tsx`, `LinkTwitchModal.test.tsx`, `useYoutubeChatPopout.test.tsx`

**Interfaces:**
- Consumes: `trackEvent`, `linkName`, `LinkRecord`.

- [ ] **Step 1: Write the failing tests** (category is `Linking`; the name is `linkName(...)` of the pair)

```ts
// useLinkSuggestion: mutual bios -> one 'auto-linked', and nothing on the next visit; accept() -> 'linked'; only offered -> nothing
// LinkAccountsModal: saving a YouTube link -> 'linked'; saving it again unchanged -> nothing; adding Kick -> 'linked' with
//   'twitch/x <-> youtube/Y + kick/k'; "Remove links" -> 'unlinked' with the removed pair's name; a failed check -> nothing
// LinkTwitchModal: saving -> 'linked' 'twitch/x <-> youtube/Title'; unchanged -> nothing; "Remove link" -> 'unlinked'
// LinkedAccounts: clicking the YouTube chip, then the Kick chip -> two 'followed'
// useYoutubeChatPopout: open() that opens a window -> one 'followed'; a blocked pop-up -> nothing
```

- [ ] **Step 2: Run; expected: FAIL**
- [ ] **Step 3: Implement**, comparing `linkName` before and after a save. In `LinkTwitchModal` the name after a save keeps the record's
  Kick part, as `linkYoutubeToTwitch` does: read it back with `findByTwitch`. Removing a YouTube link names the pair as it was.
- [ ] **Step 4: Run; expected: PASS. Types, lint. Commit** `feat(analytics): accounts linked, linked automatically, unlinked and followed`

---

### Task 6: Pop-outs and pastes

**Files:**
- Modify: `src/components/chat/useChatPopout.ts`, `src/components/chat/FloatingVideoProvider.tsx`, `src/components/search/SmartUrlInput.tsx`
- Test: `useChatPopout.test.ts`, `useChatPopout.youtube.test.ts`, `FloatingVideoProvider.test.tsx`, `SmartUrlInput.test.tsx`

- [ ] **Step 1: Write the failing tests** (category `Feature`)

```ts
// useChatPopout: open() -> ['Feature','chat pop-out']; kind 'youtube' -> ['Feature','YouTube chat pop-out']; blocked -> nothing;
//   re-attaching to a window already open -> nothing
// FloatingVideoProvider: window opened -> ['Feature','video pop-out']; refused, or closed before it was ready -> nothing
// SmartUrlInput: 'https://twitch.tv/shroud' -> ['Feature','paste','twitch']; a .m3u8 address -> 'hls'; 'shroud' -> 'text';
//   'just chatting' -> 'text'; and JSON.stringify(all calls) holds none of what was typed
```

- [ ] **Step 2: Run; expected: FAIL. Step 3: Implement. Step 4: Run; expected: PASS. Types, lint. Commit** `feat(analytics): pop-outs, and what kind of thing is pasted`

---

### Task 7: The notice, the docs and the proof

**Files:**
- Modify: `src/config/analytics.ts`, `src/components/ui/CountedNote.tsx`, `src/index.css`, `src/components/layout/AccountsRow.tsx`,
  `CLAUDE.md` (Key Files), `docs/later-dev/matomo-counting.md` (status line points to the spec)
- Test: `src/pages/__tests__/HubPage.test.tsx`, `src/components/layout/__tests__/Header.accounts.test.tsx`, `matomoBlock.test.ts`

**Interfaces:**
- Produces: `COUNTED_NOTE = 'Visits, and what is played or linked, are counted by Matomo on my own server, with no cookies and shortened IP addresses.'`
  and `UNCOUNTED_NOTE = 'Page opens are counted, with nothing about you.'`; `CountedNote` takes `className?: string`.

- [ ] **Step 1: Write the failing tests**

```ts
// HubPage and the Accounts row: both sentences are in the page, with classes counted-note and uncounted-note
// matomoBlock.test.ts, CSS: .counted-note is display:none, html.counted .counted-note is block, html.counted .uncounted-note is none
// CountedNote: the second sentence is not rendered when SEND_VISITS is false (a development build counts nothing)
```

- [ ] **Step 2: Run; expected: FAIL. Step 3: Implement** (in the Accounts row: its own full-width line under the accounts, `var(--text-secondary)`).
  **Step 4: Run; expected: PASS.**
- [ ] **Step 5: Whole suite, types, lint, build:** `vitest run --maxWorkers=2`, `tsc -b`, eslint on changed files, `vite build`. Expected: all clean.
- [ ] **Step 6: By hand, in the browser, with the real tracker.** On the dev server define `window._paq` with the tracker address set to a dead
  local path and load `https://stats.pollardjr.com/matomo.js`, so nothing reaches the real Matomo. Move Home, Twitch channel, YouTube
  video, a listed HLS stream, a DASH demo, a pasted address that fails (and click "Open address"), then the Accounts row at 360 px and desktop.
  Read every request: expected addresses, titles and events; no pasted address, query, fragment or typed text in any of them.
- [ ] **Step 7: Commit** `feat(analytics): the notice on every page, in two versions`, push, open the PR (Co-Authored-By in the description). Do not merge.
- [ ] **Step 8 (after the owner merges):** one visit to the live site with `?utm_source=smoke&utm_campaign=usage-tracking` on a deep link, from another
  site; check Pages, Events and Referrers in Matomo. First comparison with `/api/hit`: about 2026-12-08.
