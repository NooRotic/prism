# Playback debug output and rendition fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A failed decode of one video format no longer ends playback, and the About panel shows what the player is doing (status button, console output, verbose output).

**Architecture:** Three small pure libraries (playback log store, rendition guard, browser environment) that the engines write to and a new `PlaybackDebug` component reads; `VideoJSPlayer` gets the recovery.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), video.js 8.23.7 with VHS 3.17.4 (mocked in tests).

**Spec:** `docs/superpowers/specs/2026-11-14-playback-debug-and-rendition-fallback-design.md`

## Global Constraints

- `src/types/player.ts` and `src/components/search/SmartUrlInput.tsx` are not edited. `PlayerHost.tsx`, `VideoJSPlayer.tsx` may be (the owner allowed the engine fix).
- A stream address is never shown with its query values or `user:password@`; the report uses `redactAddress`. The About panel's own "Source" line stays host only.
- Commits carry no `Co-Authored-By` line. Push to `claude/playlist-store-8d7378` (PR #82) only after the whole plan is verified.
- Every log call, status change and report build must never throw into the player (guard anything that reads the browser or Video.js).

## Review Focus

- A stream that is playing fine shows a green PLAYBACK button and two console lines, and never the verbose block unless the button is pressed.
- A stream whose only renditions are of the failing format: no endless loop (two recoveries at most), then the error card with the whole log.
- A new stream, or Retry, starts a clean session; entries from the last stream never show under the next one.
- Twitch/YouTube pages: no session, no output, no errors from `logPlayback` before `beginPlayback`.

---

### Task 1: Address redaction and the playback log

**Files:**
- Create: `src/lib/playbackLog.ts`
- Test: `src/lib/__tests__/playbackLog.test.ts`

**Interfaces:**
- Produces:
  - `redactAddress(url: string): string` (scheme, host and path kept; query values `***`; `user:pass@` becomes `***@`; fragment dropped; text that is not an address returns `(not an address)`).
  - Types `PlaybackLevel = 'info' | 'ok' | 'warn' | 'error'`, `PlaybackStatus = 'idle' | 'starting' | 'retrying' | 'playing' | 'failed'`, `PlaybackEntry = { at: number; level: PlaybackLevel; source: string; message: string; data?: Record<string, unknown> }`, `PlaybackSnapshot = { status; attempts: number; url: string | null; kind: string | null; startedAt: number | null; entries: readonly PlaybackEntry[]; inspection: Record<string, unknown> | null; avoided: readonly string[] }`.
  - `beginPlayback(info: { url: string; kind: string }): void` (new session, status `starting`, attempts 1, one `info` entry "Session started"), `logPlayback(level, source, message, data?): void` (no-op while `idle`; keeps the last 300), `setPlaybackStatus(status): void` (`retrying` also increments `attempts` and logs `Attempt N`), `setPlaybackInspection(data): void`, `setAvoidedFormats(list: readonly string[]): void`, `endPlayback(): void` (back to `idle`, entries cleared), `getPlaybackSnapshot(): PlaybackSnapshot` (same object until something changes), `subscribePlayback(listener): () => void`, `usePlaybackLog(): PlaybackSnapshot` (`useSyncExternalStore`).
  - `formatPlaybackReport(snapshot: PlaybackSnapshot, extras: { environment?: Record<string, unknown>; page?: string; now?: Date }): string` (plain text sections: Summary, Attempts, Timeline, Last inspection, Browser, Page; the address through `redactAddress`).

- [ ] **Step 1: Failing tests** (`playbackLog.test.ts`): `redactAddress` table (query values hidden and keys kept, `user:pw@` hidden, fragment dropped, port kept, garbage text); log ignored while idle; `beginPlayback` makes `starting` with one entry; the cap keeps the newest 300; `setPlaybackStatus('retrying')` raises `attempts` and logs; a second `beginPlayback` clears the first session; `getPlaybackSnapshot` identity is stable between calls and changes after a log; subscribers are called once per change and not after unsubscribe; `formatPlaybackReport` contains the redacted address and never the query value `secret`, lists the attempts and the last lines.
- [ ] **Step 2:** Run `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/playbackLog.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/playbackLog.ts` per the Interfaces block (module-level state, copy-on-write snapshot).
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: a playback log the engines write to`.

### Task 2: Rendition guard

**Files:**
- Create: `src/lib/renditionGuard.ts`
- Test: `src/lib/__tests__/renditionGuard.test.ts`

**Interfaces:**
- Consumes: `setAvoidedFormats` from Task 1.
- Produces:
  - `videoFamily(codecs: string | undefined): string | null` (first video codec of a CODECS string: `avc1/avc3` → `avc`, `hvc1/hev1` → `hevc`, `dvh1/dvhe` → `dolby-vision`, `av01` → `av1`, `vp09/vp9` → `vp9`, else null).
  - `avoidFormat(family: string): void`, `avoidedFormats(): readonly string[]`, `resetAvoidedFormats(): void` (module-level set, mirrored to `setAvoidedFormats`).
  - `markAvoidedRenditions(playlists: ReadonlyArray<{ attributes?: { CODECS?: string }; disabled?: boolean }> | undefined): number` (sets `disabled = true` on playlists whose video family is avoided; returns how many it marked; marks nothing if that would leave none enabled).
  - `planDecodeRecovery(input: { code: number | undefined; attempts: number; failingCodecs: string | undefined; playlistCodecs: ReadonlyArray<string | undefined> }): { retry: true; family: string } | { retry: false; reason: string }` (retry only for code 3, `attempts < 2`, a known family that is not already avoided, and at least one playlist of another known family; `avc` failures are never avoided).
  - `installRenditionGuard(vjs: unknown): boolean` (wraps `vjs.Vhs.STANDARD_PLAYLIST_SELECTOR` and `INITIAL_PLAYLIST_SELECTOR` once so each calls `markAvoidedRenditions(this.playlists?.main?.playlists)` before the original; returns false and does nothing when `Vhs` is missing; safe to call twice).

- [ ] **Step 1: Failing tests:** `videoFamily` table; `markAvoidedRenditions` marks only avoided families, returns the count, leaves everything alone if all would be marked, copes with `undefined` and missing attributes; `planDecodeRecovery` rows (code 4 → no; attempts 2 → no; unknown codec → no; already avoided → no; only the failing family present → no; HEVC failing with an `avc1` sibling present → `{retry:true, family:'hevc'}`; `avc1` failing → no); `installRenditionGuard` with a fake `{ Vhs: { STANDARD_PLAYLIST_SELECTOR, INITIAL_PLAYLIST_SELECTOR } }`: after avoiding `hevc` the wrapped selector marks the playlists then still returns the original's result with the right `this`, a second install does not wrap twice, a missing `Vhs` returns false.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `src/lib/renditionGuard.ts` per the Interfaces block.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: avoid a video format the browser cannot decode`.

### Task 3: Browser environment report

**Files:**
- Create: `src/lib/playbackEnvironment.ts`
- Test: `src/lib/__tests__/playbackEnvironment.test.ts`

**Interfaces:**
- Produces: `collectEnvironment(): Record<string, unknown>` (`userAgent`, `language`, `devicePixelRatio`, `viewport: [w, h]`, `mediaSource: boolean`, `codecs: Record<string, boolean | 'error'>` for H.264 `avc1.64001f`, HEVC `hvc1.2.4.L123.B0`, Dolby Vision `dvh1.05.06`, AV1 `av01.0.05M.08`, VP9 `vp09.00.10.08`, AAC `mp4a.40.2`, HE-AAC `mp4a.40.5`, AC-3 `ac-3`, EC-3 `ec-3`, Opus `opus`, each through `MediaSource.isTypeSupported` with the right `video/mp4` or `audio/mp4` prefix; never throws) and `describeDecoding(codecs: string, size?: { width: number; height: number }): Promise<string>` (one line from `navigator.mediaCapabilities.decodingInfo`: `supported`, `smooth`, `powerEfficient`; a line saying it is unavailable when there is no `mediaCapabilities`; never rejects).

- [ ] **Step 1: Failing tests:** with stubbed globals (`MediaSource.isTypeSupported` true only for avc1 and aac; `navigator.mediaCapabilities.decodingInfo` resolving and rejecting; no `MediaSource`; `isTypeSupported` throwing): the table, `mediaSource: false` when missing, `'error'` entries when it throws, the decoding line text for supported/unsupported/rejected/unavailable.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `src/lib/playbackEnvironment.ts`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: report what the browser can decode`.

### Task 4: Video.js engine: logging and decode recovery

**Files:**
- Modify: `src/components/player/VideoJSPlayer.tsx`
- Test: `src/components/player/__tests__/VideoJSPlayer.recovery.test.tsx` (the fake player of `VideoJSPlayer.stall.test.tsx`, extended with `src`, `tech`, `error(null)`)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Behaviour: at module load call `installRenditionGuard(videojs)`. Log (source `videojs`) the events listed in the spec. On `playing`: `logPlayback('ok', …)` and `setPlaybackStatus('playing')`. On an error event: log it with code, message and details; on code 3 build `planDecodeRecovery` input from the tech's `vhs` (current playlist `attributes.CODECS`, all `playlists.main.playlists[*].attributes.CODECS`); when it says retry: `avoidFormat(family)`, log a `warn` ("<family> failed to decode; avoiding it and reloading (recovery N of 2)"), `setPlaybackStatus('retrying')`, `player.error(null)`, `player.src({ src, type })`, `player.play()` (errors caught), and do NOT call `onError`; otherwise `setPlaybackInspection(...)` (media element state, VHS rendition, size) and the existing `onError` path. Fire `describeDecoding` for the failing codecs and log its line.

- [ ] **Step 1: Failing tests:** (a) a code-3 error with a fake `vhs` whose current playlist is `hvc1…` and another is `avc1…` calls `player.src` again, does not call `onError`, leaves the session `retrying` with a `warn` entry and `avoidedFormats()` containing `hevc`; (b) a second and third code-3 failure: after two recoveries the third calls `onError`; (c) code 3 with only `hvc1` playlists calls `onError` at once; (d) code 4 and other codes keep today's `onError` text; (e) `playing` sets the status `playing`; (f) events log entries only after `beginPlayback`.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement the changes in `VideoJSPlayer.tsx` (extract small local helpers for reading VHS; every read in `try`).
- [ ] **Step 4:** Run the new file and `VideoJSPlayer.stall.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Video.js skips a video format it cannot decode and logs what it does`.

### Task 5: Panel, host and DASH engine logging

**Files:**
- Modify: `src/components/player/StreamPlayerPanel.tsx`, `src/components/player/PlayerHost.tsx`, `src/components/player/DashJSPlayer.tsx`
- Test: `src/components/player/__tests__/StreamPlayerPanel.test.tsx`, `PlayerHost.test.tsx` (add cases)

**Interfaces:**
- Consumes: Task 1.
- Behaviour: `StreamPlayerPanel` calls `beginPlayback({ url, kind })` on mount and `endPlayback()` on unmount; `retry` logs `info` "Retry pressed" and `setPlaybackStatus('retrying')`; the error view (`markFailed`) sets `failed`; `onPlaying` sets `playing`. `PlayerHost.advanceFallback` logs `warn` "<engine> gave up: <error>" and either "trying <next engine>" or "no engine left". `DashJSPlayer` logs start, stream initialised (`ok`), errors (`error`), and sets `playing` on the video's `playing` event.

- [ ] **Step 1: Failing tests:** panel: mounting begins a session for its address, a Retry press logs and sets `retrying`, the error view sets `failed`, unmounting ends the session (`getPlaybackSnapshot().status === 'idle'`); host: an engine error logs the hand-over entries (with a stub engine that calls `onError`).
- [ ] **Step 2:** Run both files. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement the three edits.
- [ ] **Step 4:** Re-run both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the panel, host and DASH engine write to the playback log`.

### Task 6: PlaybackDebug component

**Files:**
- Create: `src/components/streams/PlaybackDebug.tsx`
- Test: `src/components/streams/__tests__/PlaybackDebug.test.tsx`

**Interfaces:**
- Consumes: `usePlaybackLog`, `formatPlaybackReport` (Task 1), `collectEnvironment` (Task 3).
- Produces: `export default function PlaybackDebug(): JSX.Element | null` (nothing while `idle`). Renders: a `<button>` named `PLAYBACK` (`aria-expanded`, plus a visible state word: `starting`, `retrying`, `failed`, `playing`; colour `var(--accent-orange)` / `var(--accent-red)` / `var(--accent-green)`); a field labelled `Console output` with the last two entries as `+1.2s videojs: playing`, `ok` green, `error` and `warn` red; the verbose block (`<pre aria-label="Playback debug output">` with the report text) shown when the user pressed the button or, until pressed, while the status is `retrying` or `failed`; a `Copy report` button that writes the report with `navigator.clipboard.writeText` and says `Copied`.

- [ ] **Step 1: Failing tests:** nothing while idle; status text and colour per status; two console lines only (the newest two) with level classes; verbose block hidden while `playing`, shown while `retrying`/`failed`, toggled by the button in both directions; the report text contains the redacted address and no query value; Copy report calls the clipboard with that text and shows `Copied`; clipboard missing does not throw.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement the component.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** `feat: PLAYBACK button, console output and a verbose debug block`.

### Task 7: About panel, page and preview

**Files:**
- Modify: `src/components/streams/AboutPanel.tsx`, `src/hooks/useAutoFold.ts`, `src/components/admin/StreamPreview.tsx`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-13-playlist-admin-design.md` ("Piece 2 as built": one line each for the debug output and the rendition fallback)
- Test: `src/components/streams/__tests__/AboutPanel.test.tsx`, `src/hooks/__tests__/useAutoFold.test.tsx` (add cases), `src/components/admin/__tests__/StreamPreview.integration.test.tsx` (add a case)

**Interfaces:**
- Consumes: `PlaybackDebug` (Task 6), `usePlaybackLog` (Task 1).
- Produces: `useAutoFold(resetKey: string, ms = 30_000, hold = false)`: while `hold` is true the countdown does not run. `AboutPanel` renders `<PlaybackDebug />` under the metadata (stream present), passes `hold = status is retrying or failed`, and calls `reopen()` when that starts. `StreamPreview` renders `<PlaybackDebug />` under its player.

- [ ] **Step 1: Failing tests:** `useAutoFold` does not fold while `hold` is true and folds after it turns false; `AboutPanel` shows the PLAYBACK button and Console output when a session is running and neither when idle; a folded panel reopens when the status becomes `failed`; the preview shows the PLAYBACK button after a failed attempt (integration file, real panel and card, failing stand-in player).
- [ ] **Step 2:** Run the three files. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement the edits and the two doc lines.
- [ ] **Step 4:** Re-run the three files, then the whole front end, `tsc -b`, eslint and `vite build`. Expected: all pass (eslint 0 errors).
- [ ] **Step 5: Commit** `feat: playback status and debug output in the About panel and the preview`; then check the Apple 4K stream in the browser pane at its narrow width (it reproduces the failure): the status goes red while recovering and green once playing, console output shows the last two lines, the report copies.
