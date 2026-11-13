# HLS paste-to-play and honest errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pasted HLS/DASH/MP4 link (or an unrecognised one) opens the player page and plays; when it cannot, the page says why and offers Retry.

**Architecture:** Pure helpers first (`urlDetection`, `routes`, `streamSource`, `streamProbe`), then the paste box and the listing-page redirect, then optional additive hooks on the player (`onStall`, `onPlaying`, `renderError`), a diagnosis UI (`StreamStatus`), and finally the page wiring. The page renders from a source derived from the route, not from global state.

**Tech Stack:** Vite 6, React 19, TypeScript, react-router-dom, Video.js 8, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-12-hls-paste-and-errors-design.md` (approved by the owner 2026-11-12). Read it first.

Run tests with `node ./node_modules/vitest/vitest.mjs run <path>` (not `npx`; the rtk wrapper rewrites it). Read the printed `Tests  N passed` line; never trust the exit code. A transient spawn `UNKNOWN` or a timeout is a known Windows flake: re-run before treating it as real. Work in `C:\Dev\projects\PRISM-hls` on branch `feat/hls-paste-and-errors`; dependencies are already installed.

## Global Constraints

- `/hls-dash/:id` stays the shape of every player address (`isPlayerPagePath`, matrix-rain freeze, rail gutter and `floatingShouldEnd` match on it). Pasted links use the reserved id `custom`.
- `SmartUrlInput.tsx`, `PlayerHost.tsx`, `FallbackCard.tsx` and `types/player.ts` are shared with the coming YouTube Live work: edits stay in the hls/dash branch, additive and optional. Twitch and YouTube behaviour and their tests do not change. `FallbackCard.tsx` is not edited at all.
- A stall notice never unmounts the player. `onError` is kept for real Video.js errors.
- The stall threshold is 12 s (`12_000` ms). The probe timeout is 8 s.
- No new storage and no new network call except the probe, made from the visitor's browser to the address they pasted.
- Commits carry NO `Co-Authored-By` line (PR description only). Commit after every task. Never push to `main`.
- Wording is plain and short. An unreachable address is worded as a guess ("down, or it does not allow other sites (CORS)"), never as a fact.

## Review Focus

Failure modes the spec implies; each has a test in the named task.
1. A pasted `http://` address on the https site must say so without making a request (Task 3, Task 6).
2. A token URL with `=`, `&`, `%20` in its query must survive the paste, redirect and read-back unchanged (Task 1).
3. A second paste on the player page replaces the first: a new probe runs, the old result is not shown, the stall notice is cleared (Tasks 6 and 7).
4. A pasted web-page address (`https://example.com/foo`) shows "not a playlist", not a spinner (Tasks 3 and 4).
5. A Twitch demo id on the HLS route, or a Twitch/YouTube address in `?url=`, shows the not-found card, not a blank or wrong player (Tasks 2 and 7).

## File Structure

- Modify `src/lib/urlDetection.ts`: `StreamKind`, `parseStreamKind`, `detectURLTypeAs` (append only).
- Modify `src/lib/routes.ts`: `CUSTOM_STREAM_ID`, `buildStreamPath`.
- Create `src/lib/streamSource.ts`: `resolveStreamSource`.
- Create `src/lib/streamProbe.ts`: `probeStream`.
- Modify `src/components/search/SmartUrlInput.tsx` (lines ~114-125) and `src/pages/ProtocolPage.tsx` (redirect).
- Modify `src/types/player.ts`, `src/components/player/PlayerHost.tsx`, `src/components/player/VideoJSPlayer.tsx`.
- Create `src/components/player/StreamStatus.tsx`: `StreamErrorCard`, `StreamStallNotice`.
- Modify `src/pages/HlsDashPlayerPage.tsx`.
- Tests sit beside each (`__tests__/`), new files named in each task.

---

### Task 1: Kinds, forced detection and the stream path

**Files:** Modify `src/lib/urlDetection.ts`, `src/lib/routes.ts`. Test: append to `src/lib/__tests__/urlDetection.test.ts` and `src/lib/__tests__/routes.test.ts`.

**Interfaces:**
- Produces in `urlDetection.ts`: `export type StreamKind = 'hls' | 'dash' | 'mp4'`; `export function parseStreamKind(value: string | null): StreamKind | null` (exact lowercase match only); `export function detectURLTypeAs(url: string, kind: StreamKind): URLDetectionResult` returning `{ type: kind, originalUrl: url, playableUrl: url }`.
- Produces in `routes.ts`: `export const CUSTOM_STREAM_ID = 'custom'`; `export function buildStreamPath(url: string, as?: StreamKind): string` returning `/hls-dash/custom?url=<encodeURIComponent(url)>` plus `&as=<kind>` when given.

- [ ] **Step 1: Write failing tests.** `detectURLTypeAs`: `('https://h/live/playlist','hls')` equals `{type:'hls',originalUrl:'https://h/live/playlist',playableUrl:'https://h/live/playlist'}`; same for `'dash'` and `'mp4'`. `parseStreamKind`: `'hls'`, `'dash'`, `'mp4'` map to themselves; `'HLS'`, `'x'`, `''`, `null` give `null`. `buildStreamPath`: `buildStreamPath('https://h/a.m3u8')` is `'/hls-dash/custom?url=https%3A%2F%2Fh%2Fa.m3u8'`; with `'dash'` ends `&as=dash`; **round trip (Review Focus 2):** for `u = 'https://h/p.m3u8?token=a=b&c=d%20e'`, `new URL(buildStreamPath(u, 'hls'), 'http://x').searchParams.get('url')` equals `u`; `isPlayerPagePath(buildStreamPath(u).split('?')[0])` is true.
- [ ] **Step 2:** Run both test files; expect FAIL (missing exports).
- [ ] **Step 3:** Implement the five exports above in the named files.
- [ ] **Step 4:** Run both test files; expect all pass.
- [ ] **Step 5:** Commit: `git add src/lib && git commit -m "feat: stream kinds and the /hls-dash/custom path builder"`.

### Task 2: Resolve the stream source from the route

**Files:** Create `src/lib/streamSource.ts`. Test: `src/lib/__tests__/streamSource.test.ts`.

**Interfaces:**
- Consumes: Task 1 exports; `getDemoById` from `src/config/demoContent.ts`; `detectURLType`.
- Produces: `export interface StreamSource { url: string; detection: URLDetectionResult; kind: StreamKind; guessedKind: boolean }` and `export function resolveStreamSource(streamId: string | undefined, params: URLSearchParams): StreamSource | null`.

Rules: a demo counts only when its protocol is `hls` or `dash` (a Twitch demo id gives null); a demo id wins over `?url`; otherwise the url comes from `params.get('url')`; no url gives null. `as` (via `parseStreamKind`) forces the type; otherwise `detectURLType`. Detection `unknown` becomes `detectURLTypeAs(url,'hls')` with `guessedKind: true`. Detection `twitch` or `youtube` gives null. `kind` is the detection type (`hls`, `dash`, `mp4`).

- [ ] **Step 1: Write failing tests** (one `it` each): `'apple-basic'` gives the demo url, type `hls`, `guessedKind` false; `'dash-bbb'` gives kind `dash`; `'hasanabi'` (Twitch demo) gives null (Review Focus 5); `'does-not-exist'` with no url gives null; `'apple-basic'` plus `url=other` still uses the demo url; `'custom'` + `url=https://h/x.m3u8` gives `hls`, not guessed; `'custom'` + `url=https://h/live/playlist` gives type `hls`, kind `hls`, `guessedKind` true; the same plus `as=dash` gives type `dash`, not guessed; `'custom'` + `url=https://h/c.mp4` gives kind `mp4`; `'custom'` + `url=https://twitch.tv/xqc` gives null; `'custom'` + `url=https://youtube.com/watch?v=abc` gives null.
- [ ] **Step 2:** Run it; expect FAIL (module missing).
- [ ] **Step 3:** Implement `resolveStreamSource` as a pure function.
- [ ] **Step 4:** Run it; expect all pass.
- [ ] **Step 5:** Commit: `feat: resolve a stream source from the hls-dash route`.

### Task 3: The stream probe

**Files:** Create `src/lib/streamProbe.ts`. Test: `src/lib/__tests__/streamProbe.test.ts`.

**Interfaces:**
- Produces: `export type ProbeResult = { kind: 'ok' } | { kind: 'http'; status: number } | { kind: 'not-playlist' } | { kind: 'unreachable' } | { kind: 'mixed-content' }`; `export function probeStream(url: string, kind: StreamKind, options?: { fetchFn?: typeof fetch; timeoutMs?: number; pageProtocol?: string }): Promise<ProbeResult>`. Defaults: `fetch`, `8000`, `window.location.protocol`.

Rules: page `https:` and address starting `http:` (case-insensitive) gives `mixed-content` with no request. Otherwise `fetchFn(url, { signal, cache: 'no-store' })` under an `AbortController` timeout. A throw or abort gives `unreachable`. A non-ok response gives `http` with its status. `mp4`: ok on 2xx without reading the body. `hls`: ok when the first 1024 characters, trimmed of BOM and whitespace, start with `#EXTM3U`, else `not-playlist`. `dash`: ok when the first 2048 characters contain `<MPD` (case-insensitive), else `not-playlist`.

- [ ] **Step 1: Write failing tests with a fake `fetchFn`** (objects with `ok`, `status`, `text`): https page + `http://h/a.m3u8` gives `{kind:'mixed-content'}` and `fetchFn` not called (Review Focus 1); http page + http address does call `fetchFn`; HLS 200 body `#EXTM3U\n#EXT-X-VERSION:3` gives ok; HLS 200 body `<!doctype html><html>` gives `not-playlist` (Review Focus 4); DASH 200 body `<?xml version="1.0"?><MPD ` gives ok, HTML gives `not-playlist`; 404 gives `{kind:'http',status:404}`; `fetchFn` rejecting `new TypeError('Failed to fetch')` gives `unreachable`; a never-resolving `fetchFn` that honours `signal`, with `vi.useFakeTimers()` and `timeoutMs: 1000`, resolves `unreachable` after advancing 1000 ms and the signal is aborted; mp4 200 gives ok and the `text` spy is never called.
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Implement `probeStream` per the rules.
- [ ] **Step 4:** Run it; expect all pass.
- [ ] **Step 5:** Commit: `feat: probe a pasted stream address to name why it fails`.

### Task 4: Paste box routing and the listing redirect (option A)

**Files:** Modify `src/components/search/SmartUrlInput.tsx`, `src/pages/ProtocolPage.tsx`. Test: append to `src/components/search/__tests__/SmartUrlInput.test.tsx`; create `src/pages/__tests__/ProtocolPage.hls.test.tsx`.

**Interfaces:** Consumes `buildStreamPath`, `parseStreamKind` (Task 1).

- [ ] **Step 1: Write failing tests.** SmartUrlInput: render inside `MemoryRouter` with a `<Routes><Route path="*" element={<LocationSpy/>}/></Routes>` that prints `pathname + search`; type the address and press Enter; expect `/hls-dash/custom?url=<encoded>` for `https://x.test/a.m3u8`, `https://x.test/a.mpd`, `https://x.test/v.mp4`, the unrecognised `https://x.test/live/playlist`, and the web page `https://example.com/foo` (Review Focus 4). Unchanged: `https://twitch.tv/xqc` goes to `/twitch/xqc`, plain `xqc` goes to `/twitch/xqc`, `https://youtu.be/abc12345678` goes to `/youtube/abc12345678`. ProtocolPage (mock the same modules as `ProtocolPage.twitch.test.tsx`): at `/hls-dash?url=<encoded>` with routes `hls-dash` (ProtocolPage) and `hls-dash/:streamId` (LocationSpy), the final location is `/hls-dash/custom?url=<encoded>`; at `/hls-dash` with no url the `demo-grid` renders and no redirect happens.
- [ ] **Step 2:** Run both files; expect the new tests FAIL.
- [ ] **Step 3:** In `SmartUrlInput`, replace the `hls || dash` branch so `hls`, `dash`, `mp4` and `unknown` all `navigate(buildStreamPath(url))`; Twitch-without-channel keeps the existing `PLAY_URL` fallthrough. In `ProtocolPage`, after all hooks, when `protocol === 'hls-dash'` and the `url` query is present return `<Navigate to={buildStreamPath(url)} replace />`.
- [ ] **Step 4:** Run both files plus the existing `ProtocolPage.twitch*.test.tsx` and `HubPage.test.tsx`; expect all pass.
- [ ] **Step 5:** Commit: `fix: pasted stream links open the player page`.

### Task 5: Stall detection in the Video.js player

**Files:** Modify `src/types/player.ts`, `src/components/player/PlayerHost.tsx`, `src/components/player/VideoJSPlayer.tsx`. Test: append to `src/components/player/__tests__/PlayerHost.test.tsx`; create `src/components/player/__tests__/VideoJSPlayer.stall.test.tsx`.

**Interfaces:**
- `PlayerProps` gains `onStall?: () => void` (stream did not start in time; the player keeps loading) and `onPlaying?: () => void` (playback is running).
- `PlayerHostProps` gains `renderError?: (error: string | null) => ReactNode`, `onStall?: () => void`, `onPlaying?: () => void`. `renderError`, when given, replaces `<FallbackCard>` in both places `PlayerHost` renders it (the `fallback` engine case and the error-boundary fallback); the stall and playing handlers are forwarded into `playerProps`. Without them nothing changes.
- `VideoJSPlayer`: a `STALL_MS = 12_000` timer is cleared by the first `loadeddata` or `playing` event, not by `ready`. On expiry call `onStall` when provided, else `onError('Stream failed to load within 12 seconds')`. Every `playing` event calls `onPlaying`. The code-4 error message becomes `Video.js could not use this source (code 4)` (the old "autoplay denied" wording was wrong).

- [ ] **Step 1: Write failing tests.** PlayerHost (extend the existing `VideoJSPlayer` mock to capture its props): with an HLS detection and a `renderError` returning `<div data-testid="custom-error"/>`, calling the captured `onError('boom')` inside `act` shows `custom-error` and `renderError` was called with `'boom'`; without `renderError` the same call still shows `Unable to Play`; the captured props' `onStall` and `onPlaying` are the very functions passed to `PlayerHost`. VideoJSPlayer (mock `video.js` with a fake player that stores `.on(event, fn)` handlers and exposes `emit(name)`, `play()` returning a resolved promise, `isDisposed()`, `dispose()`, `error()`; use `vi.useFakeTimers()`): at 11_999 ms no callback fires; at 12_000 ms `onStall` fires once and `onError` does not; `emit('loadeddata')` at 5 s then 30 s of timers gives no `onStall`; `emit('ready')` alone does not prevent the stall (pins the old bug); with no `onStall` prop, `onError` is called with a message containing `12 seconds`; `emit('playing')` calls `onPlaying`.
- [ ] **Step 2:** Run both files; expect the new tests FAIL.
- [ ] **Step 3:** Implement per Interfaces. `DashJSPlayer` is not touched (its timer already waits for `streamInitialized`; note this in the PR description).
- [ ] **Step 4:** Run both files and the whole `src/components/player` folder; expect all pass.
- [ ] **Step 5:** Commit: `feat: stalled streams notify instead of failing, error hook on PlayerHost`.

### Task 6: Diagnosis UI

**Files:** Create `src/components/player/StreamStatus.tsx`. Test: `src/components/player/__tests__/StreamStatus.test.tsx` (mock `../../../lib/streamProbe`).

**Interfaces:**
- Consumes `probeStream`, `ProbeResult`, `StreamKind`.
- Produces `export function StreamErrorCard(props: { url: string; kind: StreamKind; guessedKind: boolean; playerError: string | null; onRetry: () => void; onTryAs: (kind: StreamKind) => void }): JSX.Element` and `export function StreamStallNotice(props: { url: string; kind: StreamKind; guessedKind: boolean; onRetry: () => void; onTryAs: (kind: StreamKind) => void }): JSX.Element`.

Behaviour: both run `probeStream(url, kind)` when `url` or `kind` changes and show a pending line ("Checking the address...") until it resolves; a late result for an old url is ignored. The explanation element carries `data-probe-result="<kind>"` and plain copy per result (`http` names the status). `unreachable` copy mentions both "down" and "CORS". The error card shows a heading and the `playerError` text as secondary detail. Buttons: Retry; "Open address" (an `<a target="_blank" rel="noopener noreferrer" href={url}>`); "Copy address" (`navigator.clipboard?.writeText(url)`, failure swallowed); when `guessedKind` is true, "Try as HLS / DASH / MP4" for each kind except the current one. The stall notice leads with "Still loading after 12 s".

- [ ] **Step 1: Write failing tests:** each of the five `ProbeResult` kinds renders `data-probe-result` equal to that kind (`http` text contains `404`); `unreachable` text matches `/down/` and `/CORS/`; `mixed-content` text contains `https`; Retry calls `onRetry`; the Open link has the `href`, `target="_blank"` and a `rel` containing `noopener`; Copy calls a mocked `navigator.clipboard.writeText` with the url and does not throw when `clipboard` is undefined; with `guessedKind` true the buttons "Try as DASH" and "Try as MP4" call `onTryAs('dash')` and `onTryAs('mp4')` and no "Try as HLS" button exists when `kind` is `hls`; with `guessedKind` false there are no Try-as buttons; **stale result (Review Focus 3):** rerender with a new url while the first probe is still pending (deferred promises): the probe is called again, and resolving the first does not render its result; the stall notice shows "Still loading".
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Implement both components over one internal `useStreamProbe(url, kind): ProbeResult | null` hook.
- [ ] **Step 4:** Run it; expect all pass.
- [ ] **Step 5:** Commit: `feat: error card and stall notice that name the cause`.

### Task 7: Wire the HLS page

**Files:** Modify `src/pages/HlsDashPlayerPage.tsx`. Test: `src/pages/__tests__/HlsDashPlayerPage.test.tsx` (mock `PlayerHost` to capture its props and a mount counter, `DebugPanel`, and `StreamStatus` as stubs exposing their callbacks via buttons).

**Interfaces:** Consumes `resolveStreamSource` (Task 2), `buildStreamPath` (Task 1), `PlayerHost` extra props (Task 5), `StreamErrorCard`/`StreamStallNotice` (Task 6).

Behaviour: derive `source = resolveStreamSource(streamId, searchParams)` and render from it, not from `state.player`. An effect still dispatches `PLAY_URL` (the debug panel and others read it) when `state.player.currentUrl` differs from `source.url` or `state.player.detection?.type` differs from `source.detection.type`. A null source renders a not-found card with a link to `/hls-dash`: "No stream called “<id>”" when the id is not `custom`, else "That address isn't an HLS, DASH or MP4 stream". Otherwise render the heading, the url, the player frame, and `PlayerHost` with `renderError`, `onStall`, `onPlaying`, keyed by `url|type|attempt`. Stall state resets when url or type changes. Retry bumps `attempt` and clears the stall. Try-as navigates to `buildStreamPath(url, kind)` with `replace` and bumps `attempt`. The stall notice renders under the player frame while stalled; `DebugPanel` stays.

- [ ] **Step 1: Write failing tests:** `/hls-dash/apple-basic` gives `PlayerHost` the demo url with detection type `hls` and dispatches `PLAY_URL`; `/hls-dash/custom?url=<enc>` plays that url under the heading "HLS Stream Player"; `/hls-dash/does-not-exist` renders "No stream called" and a link to `/hls-dash`, no `PlayerHost`; `/hls-dash/hasanabi` the same (Review Focus 5); `?url=https://twitch.tv/xqc` renders "isn't an HLS, DASH or MP4 stream"; `?url=https://h/live/playlist` gives type `hls` (guessed); calling the captured `renderError('boom')` renders the error-card stub with the url, kind and `guessedKind`; `onStall()` shows the stall stub and `onPlaying()` hides it; Retry remounts the player (mount counter goes up); Try-as `dash` changes the location to `…&as=dash` and the last `PlayerHost` detection type is `dash`; **second paste (Review Focus 3):** navigating the same mounted page to another `?url` clears the stall stub and gives `PlayerHost` the new url.
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Implement per Behaviour.
- [ ] **Step 4:** Run the file; expect all pass.
- [ ] **Step 5:** Commit: `feat: HLS page diagnoses failures and handles pasted and unknown streams`.

### Task 8: Verify and open the PR

- [ ] **Step 1:** `node ./node_modules/vitest/vitest.mjs run` (whole suite), `node ./node_modules/typescript/bin/tsc.js -b`, `node ./node_modules/eslint/bin/eslint.js .`, `node ./node_modules/vite/bin/vite.js build`. Expect the baseline test count plus the new tests, no type, lint or build errors (re-run a flaked file before investigating).
- [ ] **Step 2:** Start the dev server from the worktree: the worktree has no `.claude/launch.json`, so create an untracked copy of the main checkout's `prism-dev` entry there (`node ./node_modules/vite/bin/vite.js`, port 5000) and never `git add` it (always add explicit paths); do not edit the main checkout. In the browser pane check, as a user, each of: paste Apple bipbop `https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8` (plays); paste Unified Streaming `https://demo.unified-streaming.com/k8s/live/stable/scte35.isml/.m3u8` (plays, LIVE badge); paste `https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8` (variant 404: stall notice after 12 s, player stays); paste `https://example.com/nope.m3u8` (error card says unreachable or CORS, Retry works); an `http://` address (mixed-content copy only when the page itself is https, so state that dev on `http://localhost` cannot show it); `/hls-dash/does-not-exist` (not-found card); an old `/hls-dash?url=…` link (redirects and plays). Capture one screenshot of the error card and one of the stall notice.
- [ ] **Step 3:** Push and open the PR: `git push -u origin feat/hls-paste-and-errors`, then `gh pr create` with a body covering what changed, the checks run (test count, browser pass), what was not verified (Safari/iOS, real Chrome, DASH page, an https `http://` mixed-content run), and the note that `DashJSPlayer`'s timer is unchanged. End the body with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge; the owner merges (rebase). Then bind the PR with the `ccd_pr` tools.
- [ ] **Step 4:** Update the memory files: backlog item 2 (HLS page empty below the player: paste routing and errors done in this PR; stream info, quality picker, demo row, copy link and recents still open) and the phase-status line.
