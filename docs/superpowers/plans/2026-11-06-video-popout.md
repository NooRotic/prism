# Video Pop-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A control pops the live Twitch video into a Chrome document picture-in-picture window (always on top, resizable, video only); while it floats the chat fills the video's space, and the window follows the channel opened in the page.

**Architecture:** The floating window is owned above the routes by a `FloatingVideoProvider` mounted in `AppLayout`; it exposes `FloatingVideoControls` through a context whose default is inert, so existing components and tests are unaffected. All browser work lives in `lib/floatingWindow.ts` (open the window, show a start screen, build the Twitch player inside the window's own document after a click, switch channels, report close/failure/resize) behind an injectable opener and script loader. `ChatDock` reads the context and re-lays-out; `ChatHeader`, `ChatStrip`, a slim bar and a panel carry the controls.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`), react-router-dom, Tailwind v4, lucide-react, Vitest + Testing Library (globals on, jsdom).

**Spec:** `docs/superpowers/specs/2026-11-06-video-popout-design.md` (approved by the owner 2026-11-06). Read it first; the plan argues from it.

## Global Constraints

- Chrome or Edge 116+, secure context (https or localhost), opened from a click. Otherwise no control is shown.
- The window opens at **480×270**; a remembered size is never restored smaller than that (each side raised to it).
- The Twitch embed's `parent` is the **main page's hostname**, passed explicitly (the window's own origin reads "null").
- Strings: start screen `Click here to start with sound`; control labels `Pop out video` / `Bring video back`; panel text `The video is in a floating window`.
- **Nothing is ever drawn over the player**, in the page or the window.
- Anything the window's player waits on (timers, frames) uses the **window's own** (`win.setTimeout`), because the opening tab may be hidden.
- Code conventions: `import type` for types; no enums or constructor parameter properties; Tailwind class strings written out in full; hooks/contexts and components in separate files (react-refresh lint rule); tests are Vitest with globals.
- Commit messages are lowercase `type: subject`, with **no Co-Authored-By line** (that goes in the PR description only).
- Run tests with `node ./node_modules/vitest/vitest.mjs run <path>`, types with `node ./node_modules/typescript/bin/tsc -b`, lint with `node ./node_modules/eslint/bin/eslint.js .`, build with `node ./node_modules/vite/bin/vite.js build`. Redirect output to a scratch file outside the repo and read it (the rtk wrapper swallows output and exit codes). A suite that fails to load with `UNKNOWN ... aria-query` is a known transient: re-run first.

## Review Focus

1. **Chrome refuses the window** (no click, one already open): the page keeps its player, shows a short notice, changes nothing else (Task 3, Task 5).
2. **The window ends any way at any time** (X, back-to-tab, tab reload, before the open request even resolves): "floating" must never stay true (Tasks 2 and 3).
3. **The channel changes before the start click:** the latest channel is the one that starts (Task 2).
4. **A garbage or tiny saved size:** never throws, never restored below 480×270 (Task 1).
5. **The chat must not reload** when the video floats or returns: same DOM node before and after (Task 5).

---

### Task 1: Size, route rules, storage key, API types

**Files:**
- Create: `src/lib/floatingVideo.ts`, `src/types/document-pip.d.ts`
- Modify: `src/config/storageKeys.ts` (add `LOCAL_VIDEO_POPOUT_SIZE: 'prism_video_popout_size'` with a one-line doc comment)
- Test: `src/lib/__tests__/floatingVideo.test.ts`

**Interfaces:**
- Consumes: `URLDetectionResult` (`src/lib/urlDetection.ts`, `platform?: 'twitch-clip' | 'twitch-video' | 'twitch-stream'`), `STORAGE_KEYS`.
- Produces:
  ```ts
  export interface FloatSize { width: number; height: number }
  export const FLOAT_DEFAULT_SIZE: FloatSize            // { width: 480, height: 270 }, also the floor
  export function clampFloatSize(size: FloatSize): FloatSize
  export function loadFloatSize(): FloatSize             // saved (clamped) or the default; never throws
  export function saveFloatSize(size: FloatSize): void   // ignores non-finite or non-positive sizes
  export function isFloatingSupported(
    win?: Pick<Window, 'isSecureContext' | 'documentPictureInPicture'>,   // defaults to window
  ): boolean
  export function floatingChannelFromPath(pathname: string): string | null  // /twitch/:channel only
  export function canPopOutOn(pathname: string, detection: URLDetectionResult | null): boolean
  export function floatingShouldEnd(pathname: string, detection: URLDetectionResult | null): boolean
  ```

- [ ] **Step 1: Write the failing tests** in `floatingVideo.test.ts`. Exact cases:
  ```ts
  clampFloatSize({ width: 300, height: 200 })   // → { 480, 270 }
  clampFloatSize({ width: 800, height: 500 })   // → unchanged
  clampFloatSize({ width: 300, height: 500 })   // → { 480, 500 }
  // loadFloatSize: nothing saved → default; 'not json' → default; '{"width":"x","height":1}' → default;
  //   '{"width":1000,"height":600}' → { 1000, 600 }; '{"width":100,"height":100}' → { 480, 270 }
  // saveFloatSize({700,400}) then loadFloatSize() → { 700, 400 }; saveFloatSize({ NaN, 300 }) leaves the saved value alone
  // isFloatingSupported({ isSecureContext: true,  documentPictureInPicture: { requestWindow: vi.fn() } as never }) → true
  // …with documentPictureInPicture undefined → false; with isSecureContext false → false
  // floatingChannelFromPath: '/twitch/streamer' → 'streamer'; '/twitch/streamer/' → 'streamer';
  //   '/twitch', '/youtube/abc', '/' → null
  // canPopOutOn('/twitch/x', detectURLType('https://twitch.tv/x')) → true; with a clip or VOD detection → false;
  //   with null detection → false; ('/youtube/x', any) → false; ('/', any) → false
  // floatingShouldEnd: '/youtube/abc' → true; '/hls-dash/s' → true; '/twitch/x' + clip → true; + VOD → true;
  //   '/twitch/x' + live stream → false; '/' → false; '/twitch' → false; '/twitch/x' + null → false
  ```
  Build the clip and VOD detections with `detectURLType` on `https://clips.twitch.tv/AbcDef` and `https://twitch.tv/videos/123`, and assert in the arrange step that their `platform` is `twitch-clip` / `twitch-video`, so a wrong URL fails loudly.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/floatingVideo.test.ts`. Expected: FAIL, module `../floatingVideo` not found.
- [ ] **Step 3: Implement** the module and the storage key. Use `matchPath` from `react-router-dom` for the route checks (`/twitch/:channel`, `/youtube/:videoId`, `/hls-dash/:streamId`). Saved JSON is `{ width, height }`; validate with `Number.isFinite` and `> 0`, clamp on load only (store what the viewer left). Write `src/types/document-pip.d.ts` as a global (no imports) declaring `DocumentPictureInPictureOptions { width?, height?, disallowReturnToOpener?, preferInitialWindowPlacement? }`, `DocumentPictureInPicture extends EventTarget { requestWindow(options?): Promise<Window>; readonly window: Window | null }`, and `interface Window { documentPictureInPicture?: DocumentPictureInPicture }`.
- [ ] **Step 4: Run** the test file. Expected: PASS. Then `tsc -b`. Expected: clean. If TypeScript reports duplicate declarations because `lib.dom` already has this API, delete `document-pip.d.ts` and use the library types.
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/floatingVideo.ts src/lib/__tests__/floatingVideo.test.ts src/types/document-pip.d.ts src/config/storageKeys.ts
  git commit -m "feat: add the floating video size, route rules and window API types"
  ```

---

### Task 2: The floating window controller

**Files:**
- Create: `src/lib/floatingWindow.ts`, `src/test/fakeFloatingWindow.ts`
- Test: `src/lib/__tests__/floatingWindow.test.ts`

**Interfaces:**
- Consumes: `FloatSize` (Task 1).
- Produces:
  ```ts
  export const START_BUTTON_TEXT = 'Click here to start with sound'
  export const PLAYER_HOLDER_ID = 'prism-floating-player'
  export const READY_TIMEOUT_MS = 15000
  export const RESIZE_DEBOUNCE_MS = 300
  export interface FloatingSession {
    setChannel(channel: string): void   // no-op after close or for the channel already showing
    close(): void                       // idempotent
    readonly closed: boolean
  }
  export interface OpenFloatingOptions {
    channel: string
    parent: string                      // the main page's hostname
    size: FloatSize
    onClosed: () => void                // the window ended by any route (once)
    onFailed: () => void                // the player could not start inside it (once); the caller closes
    onResize?: (size: FloatSize) => void
    opener?: (options: { width: number; height: number }) => Promise<Window>   // default: window.documentPictureInPicture.requestWindow
    loadScript?: (win: Window) => Promise<void>   // default: append embed.twitch.tv/embed/v1.js to win.document.head
  }
  export function openFloatingWindow(options: OpenFloatingOptions): Promise<FloatingSession>
  ```
- Test helper contract (`src/test/fakeFloatingWindow.ts`, written first, used by the tests): `createFakeFloatingWindow()` returns `{ win, emit(type), setSize(width, height) }` where `win` has a real second `Document` (`document.implementation.createHTMLDocument('')`), `innerWidth/innerHeight`, `addEventListener/removeEventListener`, `close` (a `vi.fn` that emits `pagehide`), and `setTimeout/clearTimeout` that delegate to the globals at call time (so fake timers work). `createFakeTwitch({ playerHasSetChannel = true })` returns `{ Embed, instances, loadScript }`: `Embed` is a class with static `VIDEO_READY`, `VIDEO_PLAY`, records `id` and `options`, supports `addEventListener`, `getPlayer()` (an object whose `setChannel` is a `vi.fn`, absent when the flag is false), a `destroy` spy and a test-only `fire(event)`; `loadScript(win)` sets `win.Twitch = { Embed }` and resolves. Avoid constructor parameter properties.

- [ ] **Step 1: Write the helper, then the failing tests** (`floatingWindow.test.ts`). Base options: channel `'streamer'`, parent `'prism.example'`, size `{ width: 640, height: 360 }`, spies for `onClosed/onFailed/onResize`. Cases and assertions:
  1. *asks the browser synchronously with the saved size*: `opener` mocked to resolve the fake window; `openFloatingWindow(...)` called, then **before awaiting** `expect(opener).toHaveBeenCalledWith({ width: 640, height: 360 })`.
  2. *rejects with the browser's error and touches nothing else*: opener rejects `Error('no activation')`; `rejects.toThrow('no activation')`; `onClosed` and `onFailed` not called.
  3. *shows only the start screen at first*: after resolve, `doc.getElementById('prism-floating-player')` exists, `doc.querySelector('button')?.textContent === START_BUTTON_TEXT`, `loadScript` not called, `instances.length === 0`.
  4. *starts the player with sound when clicked*: click the button, flush promises; `loadScript` called with the window; `instances[0].id === 'prism-floating-player'`; `instances[0].options` matches `{ channel: 'streamer', parent: ['prism.example'], autoplay: true, muted: false }`; the button is gone.
  5. *starts the latest channel if it changed before the click*: `session.setChannel('other')`, click → `options.channel === 'other'`.
  6. *switches with setChannel once playing*: after start, `session.setChannel('other')` → `player.setChannel` called with `'other'`, `instances.length === 1`; calling it again with `'other'` does not call it twice.
  7. *recreates the player when setChannel is missing*: `createFakeTwitch({ playerHasSetChannel: false })`; `setChannel('other')` → `instances.length === 2`, `instances[1].options.channel === 'other'`, `instances[0].destroy` called.
  8. *reports failure when the script cannot load*: `loadScript` rejects → `onFailed` once, `onClosed` not called.
  9. *reports failure when the embed throws*: `Embed` constructor throws → `onFailed` once.
  10. *reports failure when the player never gets ready* (`vi.useFakeTimers()`): click, advance `READY_TIMEOUT_MS` → `onFailed` once. With `instances[0].fire(Embed.VIDEO_READY)` before the timeout → advance → `onFailed` not called.
  11. *tells the caller when the window goes away*: `emit('pagehide')` → `onClosed` once and `session.closed === true`; a second `emit('pagehide')` does not call it again.
  12. *close() closes the window once*: `session.close()` twice → `win.close` called once, `onClosed` once.
  13. *reports the size after a resize settles*: `setSize(700, 400)`, `emit('resize')` twice, advance `RESIZE_DEBOUNCE_MS - 1` → not called; advance 1 more → `onResize({ width: 700, height: 400 })` once.
  14. *setChannel after close does nothing*: no `player.setChannel`, no new `Embed`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/floatingWindow.test.ts`. Expected: FAIL, module `../floatingWindow` not found.
- [ ] **Step 3: Implement `openFloatingWindow`.** The first statement calls `opener(size)` so it runs inside the viewer's click (the function must not `await` anything before it). On resolve: set the document title, add a `<style>` (`html,body{margin:0;height:100%;background:#000;overflow:hidden}`, the holder fixed at `inset:0`, its iframe 100% × 100% with no border), add the holder `div#prism-floating-player` containing the start `<button>` filling the window, and register `pagehide` and `resize` listeners on the window. The button's click handler removes it, awaits `loadScript(win)`, builds `new win.Twitch.Embed(PLAYER_HOLDER_ID, { width: '100%', height: '100%', channel, parent: [parent], autoplay: true, muted: false, layout: 'video' })`, listens for `VIDEO_READY` to cancel the `win.setTimeout(READY_TIMEOUT_MS)` failure timer, and routes every failure (script, construction, timeout) to `onFailed` exactly once. `setChannel` keeps the latest channel in a variable and, once playing, calls `embed.getPlayer().setChannel(channel)` when that function exists, otherwise destroys and recreates the embed in the holder. Cast the window's `Twitch` global to a small local embed interface (the repo's global `Window.Twitch` type has no `setChannel`).
- [ ] **Step 4: Run** the test file. Expected: PASS (14 tests). Then `tsc -b`. Expected: clean.
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/floatingWindow.ts src/lib/__tests__/floatingWindow.test.ts src/test/fakeFloatingWindow.ts
  git commit -m "feat: open the floating video window and run the player inside it"
  ```

---

### Task 3: The app-level controller (context and provider)

**Files:**
- Create: `src/components/chat/floatingVideoContext.ts`, `src/components/chat/FloatingVideoProvider.tsx`
- Test: `src/components/chat/__tests__/FloatingVideoProvider.test.tsx`

**Interfaces:**
- Consumes: `openFloatingWindow`, `FloatingSession` (Task 2); `loadFloatSize`, `saveFloatSize`, `isFloatingSupported`, `floatingChannelFromPath`, `canPopOutOn`, `floatingShouldEnd` (Task 1); `useApp` (`state.player.detection`); `useLocation`.
- Produces:
  ```ts
  export interface FloatingVideoControls {
    supported: boolean   // the browser can do it
    canOpen: boolean     // supported, not floating, on a live Twitch channel page
    isFloating: boolean  // a window exists right now (derived from the window, never stored elsewhere)
    blocked: boolean     // Chrome refused the last request; clears itself after BLOCKED_NOTICE_MS (6000)
    open: () => void     // must run inside a click
    close: () => void
  }
  export const FloatingVideoContext: React.Context<FloatingVideoControls>  // default value is inert: all false, no-op functions
  export function useFloatingVideo(): FloatingVideoControls
  export default function FloatingVideoProvider(props: { children: ReactNode }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests** in `FloatingVideoProvider.test.tsx`. Mock `../../../lib/floatingWindow` (`openFloatingWindow` as a `vi.fn` returning a fake session `{ setChannel: vi.fn(), close: vi.fn(() => options.onClosed()), closed: false }` and capturing the options it was called with) and, with `importOriginal`, `../../../lib/floatingVideo` so only `isFloatingSupported` is a `vi.fn(() => true)`. Render inside `MemoryRouter` and the real `AppProvider`, with a probe child that prints the controls and exposes `dispatch` (from `useApp`) and `navigate` (from `useNavigate`). Use `detectURLType` for the PLAY_URL detections (live `https://twitch.tv/streamer`, clip `https://clips.twitch.tv/AbcDef`). Cases:
  1. *unsupported*: `isFloatingSupported` false → `supported` and `canOpen` false; `open()` does not call `openFloatingWindow`.
  2. *canOpen* is true on `/twitch/streamer` with the live detection; false on `/`, and false on `/twitch/streamer` with the clip detection.
  3. *open() asks synchronously and floats only after it resolves*: `open()` → `openFloatingWindow` called with `channel: 'streamer'`, `parent: window.location.hostname`, `size: loadFloatSize()`; `isFloating` still false; after the promise resolves, true.
  4. *refused*: `openFloatingWindow` rejects → `isFloating` false, `blocked` true; with fake timers, after 6000 ms `blocked` is false.
  5. *closed by any route*: invoke the captured `onClosed` → `isFloating` false and `canOpen` true again.
  6. *closed before the open request resolved*: session with `closed: true` → `isFloating` stays false.
  7. *a second open() while opening or floating does nothing* (one `openFloatingWindow` call).
  8. *follows the channel*: floating, navigate `/twitch/streamer` → `/twitch/other` → `session.setChannel('other')`; navigate to `/` → `setChannel` not called again.
  9. *ends on pages with their own video*: floating, navigate to `/youtube/abc` → `session.close` called; (separately) floating on `/twitch/streamer`, dispatch PLAY_URL with the clip detection → `session.close` called.
  10. *a failing player closes the window*: invoke the captured `onFailed` → `session.close` called.
  11. *unmounting closes the window*.
  12. *close() control* calls `session.close`.
  13. *remembers the size*: invoke the captured `onResize({ width: 700, height: 400 })` → `loadFloatSize()` returns `{ 700, 400 }`.
  14. *outside a provider* `useFloatingVideo()` returns the inert default (all flags false).
- [ ] **Step 2: Run** the test file. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** Context file: the context, its inert default and `useFloatingVideo`. Provider: `supported` computed once with `isFloatingSupported()`; `channel` from `floatingChannelFromPath(useLocation().pathname)`; `open()` bails if unsupported, no channel, or a session/opening is in flight, otherwise calls `openFloatingWindow({ channel, parent: window.location.hostname, size: loadFloatSize(), onClosed, onFailed, onResize: saveFloatSize })` **synchronously**, then on resolve sets the session ref and `isFloating` (skipping if `session.closed`), on reject sets `blocked`. `onClosed` clears the session and `isFloating`; `onFailed` closes the session. Effects: follow (`session.setChannel(channel)` when floating and `channel` changes), end (`floatingShouldEnd(pathname, state.player.detection)` while floating closes the session), unmount (close). `canOpen = supported && !isFloating && canPopOutOn(pathname, detection)`.
- [ ] **Step 4: Run** the test file. Expected: PASS (14 tests). Then `tsc -b` and `node ./node_modules/eslint/bin/eslint.js src/components/chat`. Expected: clean.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/chat/floatingVideoContext.ts src/components/chat/FloatingVideoProvider.tsx src/components/chat/__tests__/FloatingVideoProvider.test.tsx
  git commit -m "feat: own the floating video window above the routes"
  ```

---

### Task 4: The controls: button, bar, panel, header and strip

**Files:**
- Create: `src/components/chat/VideoPopoutButton.tsx`, `src/components/chat/FloatingBar.tsx`, `src/components/chat/FloatingPanel.tsx`
- Modify: `src/components/chat/ChatHeader.tsx`, `src/components/chat/ChatStrip.tsx`
- Test: `src/components/chat/__tests__/VideoPopoutControls.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface VideoControl { floating: boolean; onClick: () => void }        // from VideoPopoutButton.tsx
  <VideoPopoutButton floating onClick className size? />   // one button; aria-label and title flip: 'Pop out video' / 'Bring video back'; icon PictureInPicture2 (lucide-react)
  <FloatingBar floating onClick />       // md:hidden slim bar; text 'The video is in a floating window' while floating; holds a VideoPopoutButton
  <FloatingPanel onBringBack />          // the player-area replacement: icon, 'The video is in a floating window', a 'Bring video back' button
  // ChatHeader gains optional  videoControl?: VideoControl | null  and  dockControls?: boolean (default true)
  // ChatStrip  gains optional  videoControl?: VideoControl | null
  ```

- [ ] **Step 1: Write the failing tests** in `VideoPopoutControls.test.tsx`:
  - `VideoPopoutButton`: not floating → button named `Pop out video`; floating → `Bring video back`; click calls `onClick`.
  - `FloatingBar`: has class `md:hidden` and `data-testid="floating-bar"`; floating shows the text and a `Bring video back` button; not floating shows a `Pop out video` button and no text.
  - `FloatingPanel`: shows `The video is in a floating window` and a `Bring video back` button that calls `onBringBack`.
  - `ChatHeader` (render with the props a docked chat needs): with `videoControl={{ floating: false, onClick }}` a `Pop out video` button is present and calls `onClick`; floating → `Bring video back`; without the prop, neither exists; with `dockControls={false}` there is no `Move chat to the …` button.
  - `ChatStrip`: with `videoControl` shows the video button before the restore tab and calls its handler; without it, the existing buttons are unchanged.
  - Existing `ChatStrip.test.tsx` still passes untouched.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/chat/__tests__/VideoPopoutControls.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the three components and the two prop additions. The header button sits just before "Pop out chat" and uses the header's existing `buttonClass`; the strip button uses its `SMALL_BUTTON` look. With `dockControls={false}` the header hides the swap button and no longer claims the grip drags ("Drag to dock the chat on the other side" is only for docked-and-free state).
- [ ] **Step 4: Run** the new test file plus `src/components/chat/__tests__/ChatStrip.test.tsx`. Expected: PASS. Then `tsc -b`. Expected: clean.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/chat/VideoPopoutButton.tsx src/components/chat/FloatingBar.tsx src/components/chat/FloatingPanel.tsx src/components/chat/ChatHeader.tsx src/components/chat/ChatStrip.tsx src/components/chat/__tests__/VideoPopoutControls.test.tsx
  git commit -m "feat: add the pop out video controls to the chat header, strip and a slim bar"
  ```

---

### Task 5: ChatDock lays out around the floating video

**Files:**
- Modify: `src/components/chat/ChatDock.tsx`
- Test: `src/components/chat/__tests__/ChatDock.floating.test.tsx` (the existing `ChatDock.test.tsx` must keep passing unchanged)

**Interfaces:**
- Consumes: `useFloatingVideo`, `FloatingVideoContext`, `FloatingVideoControls` (Task 3); `VideoControl`, `FloatingBar`, `FloatingPanel` (Task 4).
- Produces: no new exports. Behaviour, with `video = useFloatingVideo()`, `floating = video.isFloating`, `videoControl = floating || video.canOpen ? { floating, onClick: floating ? video.close : video.open } : null`:
  - Player wrapper content is `player` normally; while floating it is nothing when the chat is visible and `<FloatingPanel onBringBack={video.close} />` when the chat is hidden or popped out. The wrapper stays mounted in the same place. While floating with the chat visible it also carries `max-md:hidden md:invisible` (it only sizes the row).
  - The chat panel keeps its place in the tree. While floating it gains `md:absolute md:inset-0`, and the row gains `relative` (only when no fill scope is active, since fill rows are already fixed). The resize handle's slot becomes `false` while floating rather than being removed from the child list.
  - Header: `videoControl`, `dockControls={!floating}`, and inert drag props while floating. A `<FloatingBar>` sits above the header inside the chat panel when `videoControl` is set. The strip receives `videoControl`.
  - When `video.blocked`, a `role="status"` paragraph is rendered above the row (outside it, never over the player) reading `Couldn't open the floating window. Click the button again.`

- [ ] **Step 1: Write the failing tests** in `ChatDock.floating.test.tsx`. Copy the setup of `ChatDock.test.tsx` (mock `../useChatPopout` and `../useFullscreen`, clear localStorage) and render `ChatDock` inside `<FloatingVideoContext.Provider value={controls}>` with a `controls()` factory (`supported`, `canOpen`, `isFloating`, `blocked`, `open`, `close` spies). Cases:
  1. `canOpen` true, not floating → a `Pop out video` button exists and clicking calls `open`; the player is rendered.
  2. `canOpen` false and not floating → no `Pop out video` or `Bring video back` button anywhere.
  3. floating with chat docked → the player text is not in the document; the chat iframe is; `Bring video back` buttons exist (header and bar) and call `close`; no `Move chat to the …` button; no `separator` (resize handle); the `chat-player` wrapper has classes `max-md:hidden` and `md:invisible`; the `chat-panel` has `md:absolute`; the `chat-dock` row has `relative`.
  4. **chat not reloaded:** render not floating, keep references to the `chat-panel` element and the chat iframe; re-render with `isFloating: true` (same tree, new context value); both references are still in the document and are the same nodes; then re-render not floating and they are still the same nodes.
  5. floating with chat hidden (`localStorage` placement `{"side":"right","hidden":true}`) → `The video is in a floating window` appears inside `chat-player`, `Bring video back` buttons (panel and strip) call `close`.
  6. floating with chat popped out (`useChatPopout` returns `isOpen: true`) → same panel appears.
  7. chat hidden and `canOpen` → the strip has a `Pop out video` button.
  8. `blocked: true` → the status text is present and is **not** inside `chat-player`.
  9. The video control and the notice are never inside the player wrapper when the player is rendered (not floating).
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/chat/__tests__/ChatDock.floating.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the `ChatDock` changes above. Wrap the return in a fragment for the notice; keep `containerRef` on the row.
- [ ] **Step 4: Run** the new file and `src/components/chat/__tests__/ChatDock.test.tsx`, then the whole chat folder: `node ./node_modules/vitest/vitest.mjs run src/components/chat`. Expected: PASS. Then `tsc -b`.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/chat/ChatDock.tsx src/components/chat/__tests__/ChatDock.floating.test.tsx
  git commit -m "feat: let the chat fill the space while the video floats"
  ```

---

### Task 6: Mount it, and prove the pieces work together

**Files:**
- Modify: `src/App.tsx` (wrap `AppLayout`'s returned tree in `<FloatingVideoProvider>`)
- Test: `src/components/chat/__tests__/FloatingVideo.integration.test.tsx`

**Interfaces:** Consumes everything above. Produces nothing new.

- [ ] **Step 1: Write the failing integration test.** Mock `../../../lib/floatingWindow` (`openFloatingWindow` resolving a fake session and capturing `onClosed`) and `isFloatingSupported` as in Task 3. Render `MemoryRouter` at `/twitch/streamer` + `AppProvider` + `FloatingVideoProvider` + a small page: a `ChatDock` with `channel="streamer"` and a `<div>the player</div>`, plus a child that dispatches PLAY_URL with the live detection on mount. Mock `useChatPopout`/`useFullscreen` as in the dock tests. Assert in order: `Pop out video` is shown; clicking it removes `the player` from the document and shows `Bring video back` (header) once the mocked window resolves, with the chat iframe still present; calling the captured `onClosed` brings `the player` back and the button reads `Pop out video` again; clicking `Bring video back` while floating calls the session's `close`.
- [ ] **Step 2: Run** the file. Expected: PASS, because it only uses the Task 3 and Task 5 code; the `App.tsx` mount cannot be unit tested and is checked in Step 4. To prove the test is not vacuous, temporarily make `ChatDock` ignore `isFloating`, run it again (Expected: FAIL), then revert that change.
- [ ] **Step 3: Implement** the `App.tsx` change: wrap the JSX returned by `AppLayout` in `<FloatingVideoProvider>` (it sits inside the router and `AppProvider`, which is what the provider needs). Run `tsc -b`. Expected: clean.
- [ ] **Step 4: Verify in the browser pane** (dev server on port 5000, branch checked out): open `http://localhost:5000/twitch/monstercat`; the `Pop out video` button is present in the chat header at desktop width and in the slim bar at phone width; the home page shows no such button. **Do not click it** (it would open a window on the owner's screen).
- [ ] **Step 5: Commit**
  ```bash
  git add src/App.tsx src/components/chat/__tests__/FloatingVideo.integration.test.tsx
  git commit -m "feat: mount the floating video controller in the app layout"
  ```

---

### Task 7: Whole-branch checks and handover

**Files:**
- Modify: `docs/superpowers/specs/2026-11-06-video-popout-design.md` (Status line: implemented, owner's Chrome checks pending)

- [ ] **Step 1: Run the whole suite**: `node ./node_modules/vitest/vitest.mjs run`. Expected: every test passes (the pre-existing 760 plus the new ones). Report any failure by name.
- [ ] **Step 2: Run** `node ./node_modules/typescript/bin/tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`, `node ./node_modules/vite/bin/vite.js build`. Expected: types clean, lint 0 errors (the two long-standing warnings may remain), build succeeds (the chunk-size and dashjs warnings are known).
- [ ] **Step 3: Update the spec Status line**, commit it (`git commit -m "docs: mark the video pop-out as implemented, owner checks pending"`).
- [ ] **Step 4: Final whole-branch review** by one fresh reviewer on the most capable available model, then fix Critical and Important findings test-first (superpowers:executing-plans, Final Review).
- [ ] **Step 5: Open the PR** from `feat/video-popout` to `main`. The description lists "Owed in the owner's Chrome" from the spec as unchecked boxes (including the deployed-site check), notes that the branch also carries the design doc and the roadmap line for "page not found", and ends with the Claude Code attribution line (PR description only; no trailers in commits).
