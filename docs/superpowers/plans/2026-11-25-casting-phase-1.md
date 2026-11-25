# Casting Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cast PRISM's HLS / DASH page to a Google TV device and flip channels there with its own remote.

**Architecture:** Pure modules (messages, surf list, key reducer, guide, tuner) sit under `src/lib/cast/` and know nothing of Cast. The TV page (`src/cast-receiver/`, built by its own Vite config) wires them to Cast's player with Shaka. PRISM gets a `CastProvider` in the layout, a button, a panel and the coming-soon line.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind v4, Vitest, Cast receiver framework v3 and sender framework (both from Google's addresses), ssh2 for the upload.

**Spec:** `docs/superpowers/specs/2026-11-25-casting-phase-1-design.md` (read it with this plan; it wins on behaviour)

## Global Constraints

- App id `10E81A1E` (override `VITE_CAST_APP_ID`); namespace `urn:x-cast:tv.nooroticx.prism`; receiver at `https://prism-cast.nooroticx.tv`, folder `PRISM/casting`. The server already allows that origin (checked 2026-11-25).
- No stream address on screen or in any log; names and hosts only.
- `useShakaForHls: true`; `disableIdleTimeout` not set. One engine only on the receiver page.
- Keys: match on `event.key`; capture phase on `window`; keys PRISM does not use are never blocked. Same key within 600 ms of its previous `keydown` is one press (OK, Back). Back twice within 3 s leaves. Guide closes after 15 s. Closed-guide tuning 600 ms after the last step; guide repeats one step per 100 ms. Failure after 20 s without movement (not while paused). Banner 4 s. List refresh after 30 min.
- TV layout 1280x720, 5% safe margin, text 24 px or larger, AA contrast.
- No new runtime dependency. Cast SDK types are a small local declaration file.
- Visitors without Cast load no Google script except on the HLS / DASH page, and see no change.
- Commits carry no Co-Authored-By line (it goes in the PR description). Work on branch `feat/casting-phase-1`. The stream list, favorites and player pages keep working with Cast absent.
- Test command: `node ./node_modules/vitest/vitest.mjs run <path>`. A local-only `adminAuth` `startAdminSignIn` failure is known. Type check: `node ./node_modules/typescript/bin/tsc -b`. Lint: `node ./node_modules/eslint/bin/eslint.js .`

## Review Focus

1. A remote flip while an earlier tune is still loading: the old stream's late success or error must not change the banner or state. (Task 3)
2. A favorite whose stream has left the list: skipped silently; if none remain, the surf list falls back to the group, then everything. (Task 1)
3. A sender reload or a second tab: never changes the channel, the surf list or the second tab's local player. (Tasks 5, 6)
4. The list is empty or malformed at launch: the TV still plays what was sent and says why the guide is empty; it recovers on the next guide opening. (Task 4)
5. The session ends while the viewer is on `/twitch/x`: nothing plays, no navigation, the coming-soon line goes. (Task 7)

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/cast/messages.ts` | Message and load-data types, strict parsers, constants |
| `src/lib/cast/surf.ts` | Surf list, stepping, guide groups |
| `src/lib/cast/remote.ts` | Key reducer (state, event, time) -> (state, effects) |
| `src/lib/cast/tuner.ts` | Tune lifecycle over an engine interface |
| `src/cast-receiver/castEngine.ts` | The only module touching Cast's player |
| `src/cast-receiver/main.tsx`, `TvApp.tsx`, `TvGuide.tsx`, `TvBanner.tsx`, `tv.css`, `useChannelList.ts` | The TV page |
| `cast/index.html`, `vite.cast.config.ts`, `tools/deploy-cast.mjs`, `tools/lib/castDeploy.mjs` | Build and upload |
| `src/types/cast-sdk.d.ts` | The parts of both Cast SDKs used |
| `src/lib/cast/castSender.ts` | Loads and wraps the sender SDK |
| `src/components/cast/CastProvider.tsx`, `castContext.ts`, `CastButton.tsx`, `CastPanel.tsx`, `CastComingSoon.tsx` | PRISM's side |

---

### Task 1: Messages and surf list

**Files:** Create `src/lib/cast/messages.ts`, `src/lib/cast/surf.ts`; Test `src/lib/cast/__tests__/messages.test.ts`, `surf.test.ts`

**Interfaces — Produces:**
```ts
// messages.ts
export const CAST_NAMESPACE = 'urn:x-cast:tv.nooroticx.prism'
export const CAST_APP_ID: string
export type TvState = 'tuning' | 'playing' | 'buffering' | 'paused' | 'failed' | 'ended' | 'idle'
export interface NowMessage { v: 1; type: 'now'; id: string | null; name: string; state: TvState }
export interface ContextMessage { v: 1; type: 'context'; favorites: string[] }
export interface CastLoadData { v: 1; id: string | null; kind: 'hls' | 'dash'; live: boolean; favorites: string[]; group: string | null }
export interface CastStream { id: string | null; name: string; url: string; kind: 'hls' | 'dash'; live: boolean; logo: string | null }
export function parseNow(raw: unknown): NowMessage | null        // accepts an object or a JSON string
export function parseContext(raw: unknown): ContextMessage | null
export function parseLoadData(raw: unknown): CastLoadData | null
export function contentType(kind: 'hls' | 'dash'): string        // application/x-mpegurl | application/dash+xml
export function fromEntry(entry: StreamEntry): CastStream         // live: true
// surf.ts
export type GuideGroup = { key: 'favorites' | 'all' | `group:${number}`; label: string; streams: StreamEntry[] }
export function surfList(list: StreamSnapshot | null, favorites: readonly string[], group: string | null): StreamEntry[]
export function step(list: StreamEntry[], currentId: string | null, by: number): StreamEntry | null
export function guideGroups(list: StreamSnapshot | null, favorites: readonly string[]): GuideGroup[]
```

- [ ] **Step 1: Write failing tests.** Messages: valid ones round-trip from object and string; `v: 2`, unknown `type`, a missing field, an id failing `/^[A-Za-z0-9_-]{1,64}$/`, an unknown state each give `null`; `favorites` drops bad ids, removes duplicates, caps at 1000. Surf: favorites in list order (`surfList(list, ['c','a'], null)` ids equal `['a','c']`); favorites not in the list ignored; none left -> group by name; unknown group -> whole list; `null` list -> `[]`. `step`: wraps both ends; current not in list with `by > 0` -> first, `by < 0` -> last; empty list -> `null`; `by: 3` from index 1 of 3 -> index 1. Guide groups: `Favorites`, `All`, then list groups; empty ones left out.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/cast`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** both files. `CAST_APP_ID` is `import.meta.env.VITE_CAST_APP_ID || '10E81A1E'`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cast): messages and the surf list`

### Task 2: Remote key reducer

**Files:** Create `src/lib/cast/remote.ts`; Test `src/lib/cast/__tests__/remote.test.ts`

**Interfaces — Consumes:** `GuideGroup`, `step`. **Produces:**
```ts
export interface RemoteContext { surf: StreamEntry[]; groups: GuideGroup[]; playingId: string | null }
export interface RemoteState {
  guide: { group: number; row: number } | null
  pending: { entry: StreamEntry; at: number } | null   // closed-guide flip waiting to be tuned
  lastKey: { key: string; at: number } | null
  lastGuideStepAt: number
  backArmedAt: number | null
  lastInputAt: number
}
export const REMOTE_START: RemoteState
export type RemoteEvent = { type: 'keydown' | 'keyup'; key: string } | { type: 'tick' }
export type RemoteEffect = { type: 'tune'; entry: StreamEntry } | { type: 'preview'; entry: StreamEntry } | { type: 'backHint' } | { type: 'leave' } | { type: 'noList' } | { type: 'refreshList' }
export function remote(state: RemoteState, event: RemoteEvent, now: number, ctx: RemoteContext): { state: RemoteState; effects: RemoteEffect[]; claimed: boolean }
export function isBackKey(key: string): boolean  // BrowserBack, GoBack, Escape, Backspace
```

- [ ] **Step 1: Write failing tests** (times in ms):
  - OK at 0 opens the guide on the playing channel's row and emits `refreshList`; OK keydowns at 400, 450, 500 … 3000 change nothing; OK at 3700 selects.
  - OK in the guide on another row: `tune` and guide closed; on the playing row: closed, no `tune`.
  - Closed guide: Down at 0, 450, 500, 550 emits a `preview` per accepted step and no `tune`; `tick` at 1149 nothing, at 1150 one `tune` for the last preview.
  - A pending flip is dropped when OK opens the guide.
  - Guide: Down at 0, 50, 100 moves 2 rows (100 ms limit); wraps at both ends; Left / Right change group, wrap, and put the row on the playing channel or 0.
  - Left / Right with the guide closed: no effect, `claimed: false`.
  - Back with guide open closes it; `claimed: true`. Back closed at 0: `backHint`; held repeats at 400, 450, 500: nothing; Back at 1200: `leave`. Back at 0 and 3001: `backHint` again, no `leave`. With `keyup` at 100 then Back at 300: `leave`.
  - The guide closes on `tick` 15000 after the last key, and not at 14999.
  - `MediaPlayPause`, `a`, `ColorF0Red`: `claimed: false`, state unchanged. Empty surf list: Up emits `noList`.
  - The context changes under an open guide (fewer rows): the row is clamped, never out of range.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** `remote`. `claimed` is true for Up, Down, OK, Back, and for Left / Right only with the guide open.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(cast): the remote's key rules`

### Task 3: Tuner and Cast engine

**Files:** Create `src/lib/cast/tuner.ts`, `src/cast-receiver/castEngine.ts`, `src/types/cast-sdk.d.ts`; Test `src/lib/cast/__tests__/tuner.test.ts`, `src/cast-receiver/__tests__/castEngine.test.ts`

**Interfaces — Consumes:** Task 1 types. **Produces:**
```ts
export interface EngineSample { time: number; paused: boolean; ended: boolean }
export interface CastEngine {
  load(stream: CastStream): Promise<void>       // rejects when Cast refuses the load
  stop(): void
  sample(): EngineSample | null                  // null: nothing loaded
  onError(listener: () => void): () => void
  onSenderLoad(listener: (stream: CastStream, data: CastLoadData | null) => void): () => void
}
export interface TunerView { stream: CastStream | null; state: TvState }
export interface Tuner {
  tune(stream: CastStream): void
  adopt(stream: CastStream): void                // a load the sender made: already loading, only watched
  tick(now: number): void                        // called every 250 ms
  view(): TunerView
  subscribe(listener: () => void): () => void
}
export function createTuner(engine: CastEngine, now: () => number): Tuner
export function createCastEngine(manager: cast.framework.PlayerManager): CastEngine
```

- [ ] **Step 1: Failing tuner tests** with a fake engine: tune -> `tuning`; time moving -> `playing`; 20000 ms without movement -> `failed`; movement afterwards -> `playing`; playing then 1000 ms still -> `buffering`, 20000 ms still -> `failed`; paused sample -> `paused` and the 20 s clock restarts on resume; `ended` -> `ended`; load rejection or `onError` -> `failed`; **tune A, tune B, then A rejects / A's error arrives: view stays B `tuning`**; `adopt` behaves as tune without calling `load`.
- [ ] **Step 2: Failing engine tests** with a fake `PlayerManager`: `load` sends `contentUrl`, the right `contentType`, `streamType` LIVE or BUFFERED from `live`, `autoplay`, title and logo in `GenericMediaMetadata`, and no address in `contentId` (use the stream id, or `pasted`); `media.customData` carries the id, kind and live flag. A LOAD message from a sender whose data parses calls `onSenderLoad`; a LOAD with a non-http(s) address is refused (interceptor returns an error); the engine's own loads do not call `onSenderLoad`. PLAY on a live stream that was paused seeks to the live edge first.
- [ ] **Step 3: Run** both. Expected: FAIL.
- [ ] **Step 4: Implement.** Movement = `time` differs from the last sample by more than 0.05 s. Give each tune a number; ignore results from older numbers. Errors are tied to the current tune by Cast's media session id where available, otherwise by dropping errors that arrive before the current load has been sent. `sample()` reads Cast's media element (search the player element's shadow roots, as in the spike's `castVideo`), and `null` when Cast's state is IDLE. Declare only the SDK members used.
- [ ] **Step 5: Run.** Expected: PASS. **Step 6: Commit** `feat(cast): tuner and the Cast engine`

### Task 4: The TV page and its build

**Files:** Create the `src/cast-receiver/` UI files, `cast/index.html`, `vite.cast.config.ts`; Modify `src/lib/streamsApi.ts` (a refresh), `package.json` (`build:cast`, `dev:cast`), `tsconfig.node.json` (include the new config), `.gitignore` (`dist-cast`), `.github/workflows/ci.yml` (run `pnpm run build:cast` after the build), `vite.config.ts` (nothing unless the site build picks up `cast/`); Test `src/cast-receiver/__tests__/TvApp.test.tsx`, `useChannelList.test.tsx`, `src/lib/__tests__/streamsApi.test.ts` (extend)

**Interfaces — Consumes:** Tasks 1 to 3. **Produces:** `refreshStreamSnapshot(): Promise<SnapshotResult>` in `streamsApi.ts` (a new request; a good answer replaces the remembered one, a failure leaves it and returns it if there is one); `TvApp({ engine, sendNow, leave }: { engine: CastEngine; sendNow(m: NowMessage): void; leave(): void })`; `useChannelList(): { list: StreamSnapshot | null; refreshIfOld(): void }`

- [ ] **Step 1: Failing tests.** `refreshStreamSnapshot` as described. `useChannelList`: loads on mount; `refreshIfOld` does nothing before 30 min, refreshes after, retries at once when the list is missing. `TvApp` (fake engine, fake timers, `fireEvent.keyDown(window)`): idle shows "Pick a stream in PRISM"; a sender load shows the banner name with "Tuning…" and, 4 s after playing, no banner; flipping Down shows the next favorite's name and loads it 600 ms later; OK opens the guide (`role="listbox"`, the playing row `aria-selected`); a group of 2,000 mounts under 40 rows; failure text exactly "<name> is not available right now. Press Up or Down for another channel."; ended text "<name> has finished. Press Up or Down for another channel."; paused shows "Paused"; buffering shows "Buffering…"; back hint text "Press Back again to leave", second calls `leave`; with no list, OK shows "The channel list is not available right now" and the sent stream keeps playing; list arriving on the next open fills the guide; a claimed key has `defaultPrevented` true, `MediaPlayPause` false; `sendNow` gets each state once; no text on the page ever contains the stream's address or query.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `main.tsx`: start the receiver context with `useShakaForHls: true`, the namespace as JSON, Cast's overlay hidden by CSS on `cast-media-player`; on SENDER_CONNECTED send the current `now`; `context` messages replace favorites. A sender load's favorites and group replace the stored ones; nothing else does. `leave` calls `context.stop()`. Holds `touch-controls` hidden. `vite.cast.config.ts`: root `cast`, `base: './'`, `publicDir` a `cast/public` folder holding only `.htaccess` (`index.html` no-cache, hashed assets one year) and the PRISM icon, `outDir` `../dist-cast`, target `chrome87`. `?dev` uses a fake engine around a plain `<video>`, guarded by `import.meta.env.DEV`.
- [ ] **Step 4: Run** tests, `tsc -b`, eslint, `pnpm run build`, `pnpm run build:cast`. Expected: PASS; `dist-cast/` holds only the receiver, and neither `dist-cast` nor `dist` contains the other; `dist-cast` contains no `?dev` engine (`grep -c fakeEngine` is 0).
- [ ] **Step 5: Look at it** in the browser pane at 1280x720 with `?dev`: idle, banner, guide, failure. Text 24 px or larger and inside the 5% margin (measure).
- [ ] **Step 6: Commit** `feat(cast): the TV page`

### Task 5: Sender SDK wrapper and provider

**Files:** Create `src/lib/cast/castSender.ts`, `src/components/cast/CastProvider.tsx`, `castContext.ts`; Modify `src/App.tsx` (wrap inside `FloatingVideoProvider`), `src/config/storageKeys.ts` (`SESSION_CASTING: 'prism_casting'`); Test `src/lib/cast/__tests__/castSender.test.ts`, `src/components/cast/__tests__/CastProvider.test.tsx`

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
export interface CastView {
  available: boolean            // a device that can run the app was found
  connected: boolean
  device: string | null
  now: { id: string | null; name: string; state: TvState } | null
  paused: boolean
  endedBySelf: boolean          // the last session ended without Stop being clicked on this page
}
export interface CastApi extends CastView {
  load(): void                                   // loads the SDK once; safe to call again
  start(stream: CastStream, group: string | null): void     // opens Chrome's picker
  tune(stream: CastStream, group: string | null): void      // only while connected
  togglePause(): void
  stop(): void
  clearEnded(): void
  stoppedOn: string | null      // the TV's channel id when Stop was clicked; cleared by clearEnded
}
export function useCast(): CastApi               // a working "nothing available" value with no provider
```

- [ ] **Step 1: Failing tests** with a fake `cast.framework`: the script tag is added once, only after `load()`, or on mount when `SESSION_CASTING` is set; a script error or no Chrome gives `available: false` and no throw; `autoJoinPolicy` is `TAB_AND_ORIGIN_SCOPED`; `start` then session started -> loads the stream with `CastLoadData` (favorites from `getFavorites()`), sets the mark; a resumed session does NOT load or send `context`; starring while connected sends one `context`; not connected sends none; `now` messages update the view, malformed ones ignored; `stop()` -> `endedBySelf: false` and `stoppedOn` set; a session ending otherwise -> `endedBySelf: true`, `stoppedOn: null`, mark removed; the picker being cancelled changes nothing; `isPaused` follows `RemotePlayer`; the playback log gets `casting to <device>` and no address.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** Wait for `window.cast.framework` up to 5 s after `__onGCastApiAvailable(true)`.
- [ ] **Step 4: Run** plus the whole suite (`src/`). Expected: PASS. **Step 5: Commit** `feat(cast): the sender in PRISM`

### Task 6: HLS page: button and panel

**Files:** Create `src/components/cast/CastButton.tsx`, `CastPanel.tsx`; Modify `src/components/chat/VideoPopoutBar.tsx` (an `extra?: ReactNode` slot, shown also when the video cannot float), `src/pages/HlsPage.tsx`, `src/components/search/SmartUrlInput.tsx:168` (navigate with `{ state: { castPick: true } }`), `src/components/streams/StreamCard.tsx` only if the pick needs it; Test `src/pages/__tests__/HlsPage.cast.test.tsx`, `src/components/cast/__tests__/CastButton.test.tsx`

**Interfaces — Consumes:** `useCast`, `fromEntry`. **Produces:** `castReason(source: StreamSource): string | null` (null = castable) and `toCastStream(source: StreamSource, entry: StreamEntry | null, finite: boolean): CastStream` in `src/lib/cast/castable.ts`, with tests.

- [ ] **Step 1: Failing tests.** Castable: hls / dash https yes; mp4 "Only HLS and DASH streams can be cast"; http "This address is not secure (https), so a TV cannot play it". `live`: list true, demo false, pasted `!finite`. Button: absent when not available; disabled with the reason as title; opens `start` with the page's stream and group, and closes a floating video first. Page while connected: no `<video>` / player mounted; panel shows device, the TV's channel name and state words (Tuning / Playing / Buffering / Paused / Not available / Finished / Idle), Pause or Play, Stop casting. Picking a card calls `tune` once and changes the address; **picking the card already in the address calls `tune`**; a pasted address calls `tune` once; Back / Forward (POP), a header link to `/hls-dash`, a reload with `castPick` left in history state, and the list arriving call it zero times; a `now` for another channel changes the panel and not the address. `stoppedOn` in the list -> address replaced and the player plays; not in the list -> the page's stream. `endedBySelf` -> "Casting ended" and a "Play here" button, no player until pressed. With no provider every existing HLS test passes unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** A paste tunes when `useNavigationType() === 'PUSH'` and `location.state?.castPick`, once per `location.key`. `HlsPage` calls `cast.load()` on mount.
- [ ] **Step 4: Run** `src/pages src/components`. Expected: PASS. **Step 5: Commit** `feat(cast): cast button and panel on the HLS / DASH page`

### Task 7: Coming soon

**Files:** Create `src/components/cast/CastComingSoon.tsx`; Modify `src/pages/TwitchPlayerPage.tsx`, `src/pages/YoutubePlayerPage.tsx`; Test `src/components/cast/__tests__/CastComingSoon.test.tsx`, one case added to each page's test

**Interfaces — Consumes:** `useCast`. **Produces:** `CastComingSoon({ platform }: { platform: 'Twitch' | 'YouTube' })`

- [ ] **Step 1: Failing tests.** Connected with a channel: "Casting Twitch is coming soon. Your TV keeps playing <name>."; with nothing playing: "Casting Twitch is coming soon."; not connected: nothing rendered; the session ending removes it with no navigation and no play. On each page it is outside and above the player box, in the flow, and hidden in fill mode (`fill-hide`).
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** both pages' tests. PASS. **Step 5: Commit** `feat(cast): coming soon on Twitch and YouTube while casting`

### Task 8: Upload tool

**Files:** Create `tools/lib/castDeploy.mjs`, `tools/deploy-cast.mjs`, `tools/__tests__/castDeploy.test.mjs`; Modify `server/README.md` (one line pointing here), `CLAUDE.md` (key files)

**Interfaces — Consumes:** `sftpUpload`, `passwordFrom`, `validateConfig` from `server/tools/lib/historyDeploy.mjs`; host, user and pinned keys from `server/deploy.config.json`. **Produces:** `planCastUpload(files: string[], remoteDir = 'PRISM/casting'): { dirs: string[]; files: { local: string; remote: string }[] }`; `node tools/deploy-cast.mjs [--go]`

- [ ] **Step 1: Failing tests.** `index.html` is last; `.htaccess` included; parent folders before children; a file named `.env`, a `.map` and a path with `..` refused; dry run never uploads; no pinned key refuses; the password never appears in log lines.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** It runs `build:cast` first, dry run by default. **Step 4: Run.** PASS; `node tools/deploy-cast.mjs` prints the plan and uploads nothing.
- [ ] **Step 5: Commit** `feat(cast): upload tool for the receiver`

### Task 9: Whole-branch check, rollout and tuning

- [ ] **Step 1:** Whole suite, `tsc -b`, eslint, both builds. Expected: green except the known `adminAuth` case.
- [ ] **Step 2:** Branch review, fixes, PR. **Merge only on the owner's word**, then confirm the Pages deploy.
- [ ] **Step 3 (owner's go):** upload the receiver (`--go`); remove the spike's files on the host by name, after listing them and the owner's yes. Check every uploaded file is 200 and identical.
- [ ] **Step 4 (owner, on the Gen 5):** first, whether `keyup` arrives (the receiver's dev log line on the sender). Then the checklist: cast; flip Up and Down; hold Down; guide and groups; hold OK; Back once, twice, held; a dead stream; pause for a minute and resume; close the laptop and keep flipping; reload the sender page; second tab; pick and paste from the page; Stop casting; leave with Back; Twitch and YouTube pages while casting; the Ultra with its TV's remote.
- [ ] **Step 5:** Tuning on a spike branch: the 60 streams with 2 or 3 settings of `initialBandwidth`, `autoResumeDuration` and Shaka streaming goals, against the aim (median within 0.5 s of 2.2 s, at most 10 of 58 over 5 s, no stream lost). The best goes into `castEngine.ts` with a test pinning the values, and the numbers into the spec.
- [ ] **Step 6:** Update `CLAUDE.md` and the spec ("as built").
