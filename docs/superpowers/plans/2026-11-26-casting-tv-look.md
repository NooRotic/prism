# Casting: the TV look, sharing by QR code, and the help page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dress up PRISM's TV page like a set-top box (rainbow ring, state word, live debug line, PRISM mark, clock, platform colours, "what is on" beside the guide), add a share card with a styled QR code whose style the owner picks in `/admin`, keep a joining phone from retuning the TV, and split prism-cast into a help page at `/` and the TV page at `/tv/`.

**Architecture:** Pure rules stay in `src/lib/cast/` (QR model, remote reducer, debug and clock text) and are unit-tested; the TV page (`src/cast-receiver/`) only draws them; Cast's player is still reached only through `CastEngine` (it gains a `report()`); the QR style is a key in the history server's `job_state` table behind `GET /api/tv` and `POST /api/admin/tv`; the cast build becomes two pages with a tiny classic script that decides "Cast device or not" before anything loads.

**Tech Stack:** React 19 + TypeScript (Vite 6, separate `vite.cast.config.ts` build, target chrome87), Google CAF Web Receiver v3 and Web Sender, PHP 8.4 history server, vitest (jsdom) and PHPUnit (Docker).

**Spec:** `docs/superpowers/specs/2026-11-25-casting-tv-look-design.md` (approved 2026-11-26). It builds on `docs/superpowers/specs/2026-11-25-casting-phase-1-design.md`. Visual reference: `.superpowers/comps/tv-look.html`, `.superpowers/comps/tv-qr.html` (git-ignored; `/.superpowers/comps/<name>.html` on the dev server).

## Global Constraints

- Branch `feat/cast-tv-look`, stacked on `feat/casting-phase-1` (PR #137, not merged). Merge, uploads and the owner's Cast console change happen only on the owner's word.
- The TV build targets **chrome87**: no CSS `aspect-ratio`, no individual `rotate` / `translate` / `scale` properties (use `transform`), masks with `-webkit-mask` and `-webkit-mask-composite: xor`; no `Array.prototype.at`, `Object.hasOwn`, `structuredClone`.
- TV page: drawn for 1280 x 720, `1rem` = 16 px there; nothing nearer an edge than 5 %; smallest text `1.5rem`, except the debug line at `1.15rem`; no Tailwind.
- Colours: HLS / DASH blue `#3B82F6`; the ring's colours `#9146ff #3b82f6 #22d3ee #39ff14 #ffc832 #ff6b35 #ff0000` (back to `#9146ff`); no green (`#39ff14` alone) on the TV page.
- Never an address, host or URL of a stream in the debug line, the share card, the QR code, or any log. A QR code only ever holds `https://prism.nooroticx.tv/hls-dash/<id>`.
- QR styles `'a' | 'b' | 'c'`, default **`'b'`**; highest error correction (`H`); round dots at full module size (radius 0.5 module); three coloured corner squares; PRISM's mark in the middle.
- `GET /api/tv` → `{ "v": 1, "qrStyle": "a" | "b" | "c" }`, `Cache-Control: public, max-age=300`; `POST /api/admin/tv` with `{ "qrStyle": ... }`, owner only, audited; stored in `job_state` key `tv_qr_style`; unset means `b`. No migration.
- Copy (exact): share card "Scan to watch it on your phone, star it or share it"; pasted stream "Only channels from PRISM's list can be shared from the TV"; `/tv/` in a browser "This is PRISM's TV page. It runs when you cast PRISM to a TV"; help page "To watch on your TV, open HLS / DASH in Chrome and press the Cast button"; admin "The TV uses the new style the next time its code is shown."
- Timings: share card closes after 30 s; ring one turn per 90 s at about 55 % strength; debug line refreshed at most 4 times a second while tuning, once a second otherwise; a joining sender waits at most 2 s for the TV to say what it is doing.
- Commit messages carry no Co-Authored-By line (the owner's rule: attribution goes in the PR description only).
- Tests: `node ./node_modules/vitest/vitest.mjs run <paths>` (redirect output to a file and read it); `node ./node_modules/typescript/bin/tsc -b`; `node ./node_modules/eslint/bin/eslint.js .`; builds `node ./node_modules/vite/bin/vite.js build` and `... build --config vite.cast.config.ts`; PHP `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit`. Known local-only failure: `src/lib/__tests__/adminAuth.test.ts` `startAdminSignIn`.

## Review Focus

1. A phone joins while the TV is between channels (a flip being tuned, or buffering): that is "playing" for the join rule; nothing is loaded. (Task 9)
2. A share card for a channel the TV has no list for (sent by a sender, list down): it still shows the code, with the name the sender sent. (Task 6)
3. The clock on a 24-hour device, at midnight, and where `formatToParts` gives no `dayPeriod`: right text, no stray separators. (Task 5)
4. `/tv/` opened in the Gen 5's own browser (an Android TV user agent without `CrKey`): the directions page, never a dead TV page; `?tv` in desktop Chrome still loads the real one. (Task 10)
5. Cast's statistics missing or nonsense (`getStats()` fields undefined or `NaN`, nothing buffered, no live range): those fields are left out; the line never says `NaN`, `undefined` or `Infinity`. (Tasks 4, 5)

---

### Task 1: The QR code, one model for the TV and `/admin`

**Files:**
- Create: `src/lib/cast/qrCode.ts`, `src/components/cast/QrCode.tsx`
- Test: `src/lib/cast/__tests__/qrCode.test.tsx`
- Modify: `package.json` (dependency `qrcode-generator` 1.4.4; dev dependencies `jsqr` 1.4.0 and `@resvg/resvg-js`, current 2.x)

**Interfaces:**
- Produces:
  - `type QrStyle = 'a' | 'b' | 'c'`; `const QR_STYLES: readonly QrStyle[]` (`['a','b','c']`); `const DEFAULT_QR_STYLE: QrStyle = 'b'`; `function isQrStyle(value: unknown): value is QrStyle`
  - `function shareUrl(id: string): string` → `https://prism.nooroticx.tv/hls-dash/${encodeURIComponent(id)}`
  - `interface QrLook { card: string; stops: string[]; eyes: [string, string, string] }` and `const QR_LOOKS: Record<QrStyle, QrLook>`, starting from the comp's values (A: card `#f4f4f8`, stops `#5b21b6 #1e40af #9f1239`; B: card `#050507`, stops `#c4b5fd #93c5fd #86efac #fde68a #fca5a5`, eyes `#c4b5fd #93c5fd #fca5a5`; C: card `#f4f4f8`, stops `#141420`, eyes `#9146ff #3b82f6 #ff0000`)
  - `interface QrModel { size: number; quiet: number; dots: Array<[number, number]>; eyes: Array<[number, number]>; hole: { at: number; span: number } }` and `function qrModel(text: string): QrModel` (grid from `qrcode-generator` at level `H`, quiet zone 4 modules, corner squares and a centred hole of about 22 % of the side left out of `dots`)
  - `<QrCode text={string} styleName={QrStyle} className?={string} />` drawing the comp's SVG (card, gradient dots of radius 0.5, the three corner squares, the mark from `cast/public/icon.svg` inline in the hole), with gradient ids made unique per instance (`useId`)

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment node` at the top: the read-back needs no DOM)

```tsx
const IDS = ['5a75dc06710d', '0f1e2d3c4b5a', 'bbb-hls']
function readBack(id: string, style: QrStyle): string | null {
  const svg = renderToStaticMarkup(<QrCode text={shareUrl(id)} styleName={style} />)
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 400 }, background: '#6a7a8a' }).render()
  return jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}
it.each(QR_STYLES.flatMap((style) => IDS.map((id) => [style, id] as const)))('style %s reads back as the link to %s', (style, id) => {
  expect(readBack(id, style)).toBe(shareUrl(id))
})
it('links to the channel page by id only', () => {
  expect(shareUrl('a b/c')).toBe('https://prism.nooroticx.tv/hls-dash/a%20b%2Fc')
})
it('knows its styles, and B is the default', () => {
  expect(QR_STYLES).toEqual(['a', 'b', 'c'])
  expect(DEFAULT_QR_STYLE).toBe('b')
  expect([isQrStyle('a'), isQrStyle('d'), isQrStyle(null)]).toEqual([true, false, false])
})
it('keeps the corner squares and the middle out of the dots', () => {
  const model = qrModel(shareUrl('5a75dc06710d'))
  expect(model.dots.some(([x, y]) => x < 7 && y < 7)).toBe(false)
  const { at, span } = model.hole
  expect(model.dots.some(([x, y]) => x >= at && x < at + span && y >= at && y < at + span)).toBe(false)
})
```

- [ ] **Step 2: Run.** `node ./node_modules/vitest/vitest.mjs run src/lib/cast/__tests__/qrCode.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Install the three packages and implement** `qrCode.ts` and `QrCode.tsx`. If style B does not read back, adjust only B's colours (keep light rainbow dots on near-black; brighter stops, a lighter mark backdrop) until it does, and ledger the values.
- [ ] **Step 4: Run.** Same command → PASS (9 read-backs + 3).
- [ ] **Step 5: Commit** `feat(cast): QR codes in three styles, read back in the tests`

### Task 2: What the TV is told about the QR style

**Files:**
- Create: `src/lib/tvSettingsApi.ts`
- Test: `src/lib/__tests__/tvSettingsApi.test.ts`

**Interfaces:**
- Consumes: `QrStyle`, `isQrStyle`, `DEFAULT_QR_STYLE` (Task 1); `HISTORY_API_URL`, `HISTORY_ENABLED` (`src/config/historyServer.ts`)
- Produces: `interface TvSettings { qrStyle: QrStyle }`; `function parseTvSettings(json: unknown): TvSettings | null` (exactly `{ v: 1, qrStyle }` with a known style); `function fetchTvSettings(): Promise<TvSettings | null>` (GET `${HISTORY_API_URL}/api/tv`, `cache: 'no-cache'`, `credentials: 'omit'`, 5 s timeout, never throws, `null` when disabled, failing or nonsense)

- [ ] **Step 1: Failing tests:** `parses only { v: 1, qrStyle } with a known style` (`{v:1,qrStyle:'c'}` → `{qrStyle:'c'}`; `{v:2,...}`, `{v:1,qrStyle:'z'}`, `null`, `[]` → `null`); `asks without trusting a cached copy` (mock `HISTORY_ENABLED` true and `fetch`; the call's init has `cache: 'no-cache'`, `credentials: 'omit'`, URL ends `/api/tv`); `answers null on a network error, a 503 or bad JSON`.
- [ ] **Step 2: Run** `... run src/lib/__tests__/tvSettingsApi.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(cast): the TV asks the server which QR style to draw`

### Task 3: The remote: the share card

**Files:**
- Modify: `src/lib/cast/remote.ts`
- Test: `src/lib/cast/__tests__/remote.test.ts`

**Interfaces:**
- Produces: `RemoteState.card: { at: number } | null` (in `REMOTE_START` as `null`); `RemoteContext.onAir: boolean` (something is tuned or playing); `export const CARD_MS = 30_000`. No new effect type: the card is state; Left / Right during a flip preview emits the existing `tune` effect.

Rules (spec table): guide closed, no card: Left / Right open the card when `onAir`; during a preview they tune the previewed entry at once (`tune` effect, `pending = null`) and open the card. Card up: Left / Right close it; Up / Down close it and flip as before; OK closes it and does what OK does with the guide closed; Back closes it and leaves `backArmedAt` `null` with no `backHint`. A held key never opens or closes it twice. `tick` closes it `CARD_MS` after `card.at`; `taken` closes it. Guide open: Left / Right unchanged.

- [ ] **Step 1: Failing tests** (in a new `describe('the share card')`, using the file's `hand()` / `press()` / `of()` helpers; give `CTX` `onAir: true`):
  - `Left or Right opens it for what is on, and closes it` → `press('ArrowRight', 0).state.card` is `{ at: 0 }`; a second `ArrowLeft` at 1000 makes it `null`.
  - `does nothing with nothing on` → with `onAir: false`, `ArrowRight` is claimed and `card` stays `null`.
  - `during a flip preview tunes that channel at once and opens its card` → `ArrowDown` at 0 then `ArrowRight` at 100: `of('tune')` has the previewed entry, `state.pending` is `null`, `card` set.
  - `Up or Down closes it and flips`, `OK closes it and opens the guide`, `Back closes it and does not arm leaving` (`of('backHint')` empty, `backArmedAt` null).
  - `closes by itself after 30 s` → tick at 29_999 keeps it, tick at 30_000 clears it; `taken` clears it.
  - `a held Right opens it once` → presses at 0, 450, 500 leave it open (not toggled).
  - Change the existing test that says Left / Right with the guide closed do nothing so it now expects the card.
- [ ] **Step 2: Run** `... run src/lib/cast/__tests__/remote.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `remote()`.
- [ ] **Step 4: Run** → PASS (all of the file).
- [ ] **Step 5: Commit** `feat(cast): Left and Right bring up the share card`

### Task 4: What the player is doing, for the debug line

**Files:**
- Modify: `src/lib/cast/tuner.ts` (the `CastEngine` interface), `src/cast-receiver/castEngine.ts`, `src/types/cast-sdk.d.ts` (`PlayerManager.getStats()`), `src/cast-receiver/devStandIn.ts`, every test fake of `CastEngine` (`tuner.test.ts`, `TvApp.test.tsx` and any other `grep -l "onSenderLoad" src`)
- Test: `src/cast-receiver/__tests__/castEngine.test.ts`

**Interfaces:**
- Produces:

```ts
export interface EngineReport {
  engine: string          // 'shaka' on the TV (useShakaForHls), 'stand-in' on the dev page
  step: string | null     // the latest player event: 'PLAYER_LOADING', 'LOADED_METADATA', 'BUFFERING', 'PLAYING', 'PAUSE', or 'ERROR <code>'
  width?: number; height?: number
  bitrate?: number        // bits per second playing (stats.streamBandwidth)
  bandwidth?: number      // bits per second measured (stats.estimatedBandwidth)
  buffered?: number       // seconds buffered ahead of the playhead
  behindLive?: number     // seconds behind the live edge (live streams only)
  dropped?: number        // dropped frames
}
// CastEngine gains: report(): EngineReport
```

Only finite, non-negative numbers are set; anything else is left out. The step follows the same phase rule as errors: an event of the stream before (before `PLAYER_LOADING`) does not change it, and a new tune resets it to `null`.

- [ ] **Step 1: Failing tests** with the file's fake manager: `reports the latest step of the stream that is loading` (load, fire `PLAYER_LOADING` → `step` `'PLAYER_LOADING'`; an `ERROR` with `detailedErrorCode` 905 after it → `'ERROR 905'`); `ignores the stream before` (an `ERROR` fired before `PLAYER_LOADING` leaves `step` `null`); `reads Cast's statistics and the video` (stub `getStats()` → `{ width: 1920, height: 1080, streamBandwidth: 6.2e6, estimatedBandwidth: 4.1e7, droppedFrames: 0 }`, a video with `currentTime` 10 and `buffered` end 18.4, live range end 14.1 → those fields, `buffered` 8.4, `behindLive` 4.1); `leaves out what is missing or nonsense` (`getStats()` returning `{ width: NaN }` or throwing, no video, no live range → only `engine` and `step`).
- [ ] **Step 2: Run** `... run src/cast-receiver/__tests__/castEngine.test.ts` → FAIL.
- [ ] **Step 3: Implement** `report()`; add the event names to the listeners already there; `getStats` typed as returning `Partial<{ width: number; height: number; streamBandwidth: number; estimatedBandwidth: number; droppedFrames: number }>`.
- [ ] **Step 4: Run** the engine, tuner and TV page tests → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `feat(cast): the TV engine reports what the player is doing`

### Task 5: The words: the debug line and the clock

**Files:**
- Create: `src/cast-receiver/tvText.ts`
- Test: `src/cast-receiver/__tests__/tvText.test.ts`

**Interfaces:**
- Consumes: `EngineReport` (Task 4), `TvState`
- Produces:
  - `interface DebugInput { state: TvState; sinceTuneMs: number; startedInMs: number | null; report: EngineReport; kind: 'hls' | 'dash'; live: boolean; place: { at: number; of: number } | null }` (`place.at` is 1-based)
  - `function debugLine(input: DebugInput): string` — parts joined by ` · `:
    - `tuning` / `buffering`: `mm:ss.cc` since the tune, `step`, `engine`, `kind`, `ch <at>/<of>`
    - `playing` / `paused`: the state in capitals, `<w>×<h>`, `<bitrate Mb/s> of <bandwidth> Mb/s` (one decimal for the first, whole for the second; just `<bitrate> Mb/s` without bandwidth), `buf <s> s`, `behind live <s> s` (live only), `dropped <n>`, `start <s> s` (two decimals)
    - `failed` / `ended`: `step` (for example `ERROR 905`), time since the tune, `engine`, `kind`
    - a missing field drops its part
  - `function clockParts(date: Date, locale?: string, timeZone?: string): { time: string; period: string | null }` from `Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).formatToParts`

- [ ] **Step 1: Failing tests:** `tuning` → `debugLine({ state: 'tuning', sinceTuneMs: 1420, startedInMs: null, report: { engine: 'shaka', step: 'PLAYER_LOADING' }, kind: 'hls', live: true, place: { at: 12, of: 58 } })` is `'00:01.42 · PLAYER_LOADING · shaka · hls · ch 12/58'`; `playing` → with `{ width: 1920, height: 1080, bitrate: 6.2e6, bandwidth: 4.1e7, buffered: 8.4, behindLive: 4.1, dropped: 0 }` and `startedInMs: 2310` is `'PLAYING · 1920×1080 · 6.2 of 41 Mb/s · buf 8.4 s · behind live 4.1 s · dropped 0 · start 2.31 s'`; `failed` → `'ERROR 905 · 00:20.00 · shaka · hls'`; `leaves out what it does not have` (report `{ engine: 'shaka', step: null }`, no place → `'00:00.50 · shaka · hls'` while tuning; the output never matches `/NaN|undefined|Infinity|null/`); `a recording is never "behind live"`. Clock: `en-US` / `America/New_York` at `2026-11-26T02:47:00Z` → `{ time: '9:47', period: 'PM' }`; `en-GB` / `Europe/London` same instant → `{ time: '02:47', period: null }`; midnight in `en-US` → `{ time: '12:00', period: 'AM' }`.
- [ ] **Step 2: Run** `... run src/cast-receiver/__tests__/tvText.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(cast): the TV's debug line and clock, as text`

### Task 6: The TV page's new look

**Files:**
- Create: `src/cast-receiver/TvRing.tsx`, `TvClock.tsx`, `TvShareCard.tsx`, `useQrStyle.ts`
- Modify: `src/cast-receiver/TvApp.tsx`, `TvBanner.tsx`, `TvGuide.tsx`, `tv.css`
- Test: `src/cast-receiver/__tests__/TvApp.test.tsx`, `TvBanner.test.tsx` (create if absent), `useQrStyle.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `<TvRing className={string}>{children}</TvRing>`: the panel plus a turning layer cut to a 2 px edge; the layer's side is the panel's diagonal, measured once after mount; it turns with a `transform: rotate()` keyframe over 90 s.
  - `<TvClock />`: `clockParts(new Date())`, refreshed on the minute; colon in a span that fades.
  - `<TvBanner name entry group state debug compact? />`: state word above the name (`.tv-state-rainbow` while `tuning`, dim otherwise; words: Tuning, Buffering, Paused, Live · <group> / Playing for a recording), the debug line, the mark (`PrismMark variant="icon"`) at the right. `compact` is the "now" card beside the guide.
  - `<TvShareCard stream={CastStream} entry={StreamEntry | null} group={string | null} qrStyle={QrStyle} />`: a code only when `stream.id !== null`; otherwise the pasted-stream sentence.
  - `useQrStyle(): { style: QrStyle; ask(): void }`: starts at `DEFAULT_QR_STYLE`, asks `fetchTvSettings()` on mount and on `ask()`, keeps the last good answer.
- In `TvApp`: keep `tuneAt` and `startedInMs` per tune (set in `tune` / `adopt`, first `playing`); poll `engine.report()` on the existing tick, at most 4 a second while `tuning` / `buffering`, otherwise once a second; `context.onAir = view.stream !== null`; open the card from `hand.card` and call `ask()` when it opens; the clock shows while the guide, the banner or the card shows; the "now" banner (`compact`) shows while the guide is open; the failed / ended message gets the debug line under it and no clock; the guide gets a small `HLS / DASH` line and blue in place of green; `named && !guide` stays the rule for the big banner.

- [ ] **Step 1: Failing tests** (TvApp tests use the file's fake engine, now with `report()`):
  - `Right shows the share card with the channel's code` → with a listed stream on, `ArrowRight` shows the text "Scan to watch it on your phone, star it or share it" and an `svg` inside the card; `ArrowLeft` hides it.
  - `a stream without an id has no code` → after a sender load with `id: null`: the pasted sentence, no `svg`.
  - `a channel the TV has no list for still gets its code` (Review Focus 2) → list unavailable, sender load with `id: 'abc123def456'` and a name: the name and an `svg`.
  - `the card asks which style to draw` → `fetchTvSettings` mocked to `{ qrStyle: 'a' }`: called at start and again when the card opens.
  - `the clock shows only with the guide, the banner or the card` → no clock on the start screen or over a playing picture after the banner has gone; present with the guide open.
  - `the guide shows what is on beside it` → OK while playing: the guide and a `compact` banner with the playing name.
  - `the debug line follows the player, and a dead channel shows its error` → engine report step `PLAYER_LOADING` while tuning appears in the banner; on failure the message has `ERROR 905` under it.
  - `no address anywhere` → after loading a stream whose URL is `https://secret.example/token=abc/x.m3u8`, open the banner, card and guide: `document.body.textContent` contains neither `secret.example` nor `token`.
  - `TvBanner`: the state word is above the name; `tuning` uses the rainbow class; `Live · News` when playing a live stream of group News.
  - `useQrStyle`: default `b`; `a` after the server says so; stays `a` when a later ask fails.
- [ ] **Step 2: Run** `... run src/cast-receiver` → FAIL.
- [ ] **Step 3: Implement**, against the comps (`/.superpowers/comps/tv-look.html`, `tv-qr.html`); look at it on the dev stand-in `/cast/index.html?dev` (before Task 10 moves it) at 1280 x 720 in the browser pane.
- [ ] **Step 4: Run** `... run src/cast-receiver src/lib/cast` → PASS; `tsc -b`, eslint clean; `vite build --config vite.cast.config.ts` succeeds.
- [ ] **Step 5: Commit** `feat(cast): the TV page's new look - ring, state word, debug line, clock, share card`

### Task 7: The server: `GET /api/tv` and `POST /api/admin/tv`

**Files:**
- Create: `server/src/Tv/TvSettings.php`
- Modify: `server/src/Api/Router.php` (route `/api/tv`), `server/src/Admin/AdminController.php` (route `/api/admin/tv`, constructor gains `TvSettings`), `server/src/Container.php` (wiring), `server/README.md` (the two endpoints in the API list)
- Test: `server/tests/TvSettingsApiTest.php`

**Interfaces:**
- Produces: `final class TvSettings { __construct(JobState $state, AuditStore $audit); qrStyle(): string /* 'a'|'b'|'c', default 'b' */; setQrStyle(string $style): bool /* false for anything else; audits 'tv_qr_style', target '', detail "<old> -> <new>" */ }`. `GET /api/tv` → 200 `{"v":1,"qrStyle":"b"}` with `public, max-age=300`, CORS as `/api/streams`; other methods 405 with `Allow: GET, OPTIONS`. `POST /api/admin/tv` (owner) with `{"qrStyle":"c"}` → 200 `{"ok":true,"qrStyle":"c"}`; a body that is not an object with exactly a known `qrStyle` → 400 `bad_request`; over the admin body limit → 413; GET → 405 `Allow: POST, OPTIONS`.

- [ ] **Step 1: Failing tests** (follow `AdminCheckerApiTest`'s setup): `testTheTvGetsBByDefault`, `testTheOwnerChangesItAndTheTvSeesIt` (POST c → GET says c, an `admin_audit` row `tv_qr_style` with `b -> c`), `testOnlyTheOwnerMayChangeIt` (no token 401, stranger 403, nothing changed), `testNonsenseIsRefused` (`{"qrStyle":"d"}`, `{}`, `[]`, `"c"` → 400, nothing changed), `testTheAnswerMayBeCachedFiveMinutes` (`Cache-Control: public, max-age=300`), `testWrongMethods` (POST `/api/tv` and GET `/api/admin/tv` → 405 with their Allow headers).
- [ ] **Step 2: Run** `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit --filter TvSettingsApiTest` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole PHP suite → PASS.
- [ ] **Step 5: Commit** `feat(server): the TV's QR style, read by the TV and set by the owner`

### Task 8: `/admin` TV screen

**Files:**
- Create: `src/components/admin/TvScreen.tsx`
- Modify: `src/lib/adminApi.ts` (`setTvQrStyle`), `src/components/admin/AdminShell.tsx` (tab `{ to: '/admin/tv', label: 'TV', end: false }` after Health), `src/pages/AdminPage.tsx` (route `tv`)
- Test: `src/components/admin/__tests__/TvScreen.test.tsx`, `src/lib/__tests__/adminApi.test.ts` (one case)

**Interfaces:**
- Consumes: `QrCode`, `QR_STYLES`, `shareUrl` (Task 1); `fetchTvSettings` (Task 2); `/api/admin/tv` (Task 7)
- Produces: `function setTvQrStyle(style: QrStyle): Promise<AdminResult<{ qrStyle: QrStyle }>>` through the file's `request()` (`method: 'POST'`, body `{ qrStyle }`, parse `{ ok: true, qrStyle }` strictly).

The screen draws the three styles with `shareUrl` of the server list's default channel (`loadStreamSnapshot()`; with no list, `'bbb-hls'`), marks the one in use (from `fetchTvSettings()`, which skips the cache), and has one "Use this style" button per style; after a POST the screen takes the answer's style as current. Copy: "The TV uses the new style the next time its code is shown." Failure states as on the other admin screens (signed out, refused, unavailable).

- [ ] **Step 1: Failing tests:** `shows the three styles and which one the TV uses` (server says `b`: three `svg`s, B marked in use); `choosing one tells the server and shows the answer` (click A's button: `setTvQrStyle('a')` called; A marked after the answer); `says so when the server cannot be reached` (`fetchTvSettings` → `null`: a "cannot reach the server" line, styles still drawn, buttons still work); adminApi: `setTvQrStyle posts the style and reads the answer`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `... run src/components/admin src/lib/__tests__/adminApi.test.ts src/pages` → PASS.
- [ ] **Step 5: Commit** `feat(admin): choose the TV's QR style`

### Task 9: A phone that joins a TV which is playing

**Files:**
- Modify: `src/lib/cast/castSender.ts`, `src/types/cast-sdk.d.ts` (`CastSession.getMediaSession(): { playerState: string } | null`), `src/lib/cast/__tests__/fakeCast.ts`
- Test: `src/lib/cast/__tests__/castSender.test.ts`, `src/pages/__tests__/HlsPage.castFlow.test.tsx`

**Interfaces:**
- Consumes: the TV's `now` message (phase 1).
- Produces: `const JOIN_WAIT_MS = 2_000`. The sender keeps two things apart: `startedWith` (the page's stream from the Cast button) and `picked` (a card or paste made while connecting or rejoining). On `SESSION_STARTED`: a `picked` is loaded at once; after a rejoin nothing else; otherwise the sender decides whether the TV has a channel on — at once if `getMediaSession()` is there and not `IDLE`; else by the first `now` message (busy for `tuning`, `playing`, `buffering`, `paused`); with neither within `JOIN_WAIT_MS`, it treats the TV as idle — and only when idle loads `startedWith ?? offered()`. A pick made while it waits is loaded at once and ends the wait. `SESSION_RESUMED` loads only `picked`.
- `fakeCast`: `sessionStarted(device, tv?: { state: TvState; id?: string; name?: string } | 'silent')`: by default the fake sends `{ v: 1, type: 'now', id: null, name: '', state: 'idle' }` right after `STARTED`, as a launched TV page does; `mediaSession(state: string | null)` sets what `getMediaSession()` returns.

- [ ] **Step 1: Failing tests:**
  - sender: `a TV that is playing keeps its channel when a page joins` (start, `sessionStarted('TV', { state: 'playing', id: 'b', name: 'Beta' })` → no `loadMedia`, `view().now` is Beta); `so does one between channels` (Review Focus 1: `tuning` and `buffering` → no load); `an idle TV gets the page's stream as soon as it says so`; `a finished or failed TV gets it too`; `a TV that says nothing gets it after 2 s` (fake timers, `'silent'`: nothing at 1_999, a load at 2_000); `Cast's own media session answers at once` (`mediaSession('PLAYING')` → no load and no wait; `mediaSession('IDLE')` → waits for `now`); `a pick made while it waits is sent at once` ; `a pick made while connecting is sent even to a playing TV`.
  - page flow: `a phone pressing Cast while the TV plays sees the TV's channel and changes nothing` (mount `/hls-dash/aaa`, Cast, `sessionStarted('TV', { state: 'playing', id: 'bbb', name: 'Beta' })` → `loaded()` empty, the panel says Beta).
  - The existing sender and flow tests keep passing with the fake's default idle TV.
- [ ] **Step 2: Run** `... run src/lib/cast src/pages/__tests__/HlsPage` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(cast): joining a TV that is playing never retunes it`

### Task 10: Two addresses: the help page at `/`, the TV page at `/tv/`

**Files:**
- Create: `cast/public/cast-device.js` (classic script), `cast/tv/index.html` (today's page moved, with the gate), `src/cast-receiver/help/main.tsx`, `src/cast-receiver/help/HelpPage.tsx`, `src/cast-receiver/NotOnDevice.tsx`
- Modify: `cast/index.html` (now the help page), `src/cast-receiver/main.tsx`, `vite.cast.config.ts` (two inputs; `cast/index.html` → `index.html`, `cast/tv/index.html` → `tv/index.html`), `tools/lib/castDeploy.mjs` (`index.html` files last, deepest first; both required)
- Test: `src/cast-receiver/__tests__/castDevice.test.ts`, `src/cast-receiver/help/__tests__/HelpPage.test.tsx`, `src/cast-receiver/__tests__/NotOnDevice.test.tsx`, `tools/__tests__/castDeploy.test.mjs`

**Interfaces:**
- Produces: `cast-device.js` defines `window.prismCast = { isDevice(userAgent: string): boolean }` (`/CrKey/.test(ua)`) and reads its own script tag's `data-page`:
  - `data-page="help"`: on a device, `location.replace('/tv/' + location.search)`;
  - `data-page="tv"`: when `isDevice(navigator.userAgent)` or the query has `tv`, it appends Google's receiver script (`https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js`) and sets `window.prismCastReady` to a promise that resolves `true` on its `load`, `false` on `error`; otherwise `window.prismCastReady = Promise.resolve(false)`.
  - `main.tsx`: `?dev` on the dev server first (unchanged stand-in); else `await window.prismCastReady` → `true`: `startOnTv()`; `false`: draw `<NotOnDevice />` ("This is PRISM's TV page. It runs when you cast PRISM to a TV", a button to `/`, the TV page's look).
  - `HelpPage`: a short paragraph on what PRISM is; links to `https://prism.nooroticx.tv/twitch`, `/youtube`, `/hls-dash` labelled Twitch, YouTube, HLS / DASH, each in its platform colour (`#9146FF`, `#FF0000`, `#3B82F6`); the line "To watch on your TV, open HLS / DASH in Chrome and press the Cast button"; PRISM's mark; the ring; large enough for a TV, fine at 360 px width; never loads Google's receiver script.
  - `planCastUpload(files)`: throws without `index.html` or `tv/index.html`; orders `tv/index.html` then `index.html` after every other file.

- [ ] **Step 1: Failing tests:**
  - `castDevice`: run the file's text in jsdom with a stubbed `navigator.userAgent`, `location` and a `<script data-page>` (the way `extension/handoff.js` is tested): `knows a Cast device by CrKey` (the Gen 5's `... CrKey/1.56.500000 ...` → true; desktop Chrome and an Android TV browser UA without `CrKey` → false); `the help page sends a Cast device to /tv/, keeping the query`; `the help page stays for everyone else`; `the TV page loads Google's script on a device, or with ?tv, and says when it has` (script appended; firing `load` resolves `prismCastReady` to true, `error` to false); `the TV page in a browser loads nothing and says false` (Review Focus 4).
  - `HelpPage`: the three links with those addresses and colours; the cast line; no `script[src*="cast_receiver"]` in the document.
  - `NotOnDevice`: the sentence and a link to `/`.
  - `castDeploy`: `puts the TV page and then the help page last`; `refuses a build without tv/index.html`.
- [ ] **Step 2: Run** `... run src/cast-receiver tools/__tests__` → FAIL.
- [ ] **Step 3: Implement.** Move `cast/index.html` to `cast/tv/index.html` with `<script src="/cast-device.js" data-page="tv"></script>` first in `<head>` in place of Google's script tag; the help page gets `data-page="help"`.
- [ ] **Step 4: Run** the tests → PASS; `vite build --config vite.cast.config.ts` → `dist-cast/index.html` and `dist-cast/tv/index.html` exist, and only `tv/index.html` names `cast-device.js` with `data-page="tv"`; `node tools/deploy-cast.mjs` (dry run) lists `PRISM/casting/tv/index.html` then `PRISM/casting/index.html` last. Look at both pages on the dev server (`/cast/index.html`, `/cast/tv/index.html?dev`, `/cast/tv/index.html`) in the browser pane.
- [ ] **Step 5: Commit** `feat(cast): the help page at /, the TV page at /tv/`

### Task 12 (added 2026-11-26 at the owner's request): the page follows the TV

**Files:** Modify `src/pages/HlsPage.tsx`; Test `src/pages/__tests__/HlsPage.castFlow.test.tsx`, `HlsPage.cast.test.tsx`; spec goal 10.

Rule: while connected, on the TV's first word after connecting and on every word whose state is `tuning`, a `now.id` that resolves (demo or list) and differs from the page's id moves the page with `navigate(..., { replace: true })`. Never tunes. Tests: a remote flip moves the page in place without tuning; a phone that joins shows the TV's channel; a reload follows; a late word about the old channel does not undo a card picked here; a channel not in the list or a pasted address leaves the page; a second cast in the same visit follows again; a word before the list arrives is kept until it does.

### Task 11: Whole-branch check, documents, PR and rollout

- [ ] **Step 1:** Whole suite, `tsc -b`, eslint, both builds, the PHP suite. Expected: green except the known `adminAuth` case.
- [ ] **Step 2:** `CLAUDE.md` (casting entry: the share card, QR styles and `qrCode.ts`, `tvSettingsApi.ts`, the two addresses, `cast-device.js`, the admin TV screen); the spec's "as built" notes and every ruling.
- [ ] **Step 3:** Final whole-branch review by a fresh reviewer, fixes, PR against `feat/casting-phase-1` (retarget to `main` once #137 merges). **Merge only on the owner's word.**
- [ ] **Step 4 (owner's go, in this order):** the server (`node server/tools/deploy.mjs --go`; check `GET https://prism-data.nooroticx.tv/api/tv` answers `b`), the TV pages (`node tools/deploy-cast.mjs --go`; every file 200 and identical; `/` forwards a Cast device), then the owner changes the receiver address in the Cast console to `https://prism-cast.nooroticx.tv/tv/`.
- [ ] **Step 5 (owner, on the Gen 5):** the checklist in the spec's Testing section (share card and scanning with the Fold5 and an iPhone if at hand; clock time zone; ring smoothness on the Gen 5 and the Ultra; an Android phone joining while the TV plays; the help page in a desktop browser and cast from Chrome's menu; `/tv/` in the Gen 5's own browser; the app at `/tv/` after the console change and at `/` before it; switching the style in `/admin`).
