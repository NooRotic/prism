# Chat Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the viewer hide the Twitch chat, dock it on the left or right of the video, and pop it out into a window they size and place themselves, without ever drawing anything over the embed.

**Architecture:** A `ChatDock` layout component replaces the fixed player/chat row in `TwitchPlayerPage` and owns persisted placement (`{ side, hidden }`). Pop-out state is runtime-only, derived from a `BroadcastChannel` conversation with a PRISM-owned `/chat/:channel` page that renders the same `ChatSource` in its own window.

**Tech Stack:** React 19, TypeScript, Tailwind v4, React Router, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-04-chat-placement-design.md`

## Global Constraints

- **Nothing may be drawn over the Twitch embed iframe**, ever. Hide/return tabs live in reserved space beside the player, never inside the player wrapper. Only Spike 1 (Task 4) may relax this, and only for transient drop zones.
- Chat is docked **right** by default, as today. The split keeps its key `prism_panel_ratio`, default `0.8`, clamp `0.5`–`0.92` (`STORAGE_KEYS.LOCAL_PANEL_RATIO`).
- New keys go in `src/config/storageKeys.ts`: `LOCAL_CHAT_PLACEMENT: 'prism_chat_placement'` and `LOCAL_CHAT_POPOUT_BOUNDS: 'prism_chat_popout_bounds'`.
- Below Tailwind `md` (768px) the current stacked layout stays and **all placement controls are hidden**.
- Pop-out: window name and `BroadcastChannel` name are both `'prism-chat-popout'`; it is opened synchronously inside the click handler; **never pass `noopener`** (it makes `window.open` return `null`).
- No bottom dock, no in-page floating window, no combined chat (spec non-goals).
- Do not set state synchronously inside an effect (the `react-hooks/set-state-in-effect` lint rule is active). Wrap storage access in try/catch and render correctly without it.
- Commit messages carry **no** `Co-Authored-By` trailer. **Do not push, open a PR or merge without the owner's say-so.**
- Run tests with `node ./node_modules/vitest/vitest.mjs run <path> --maxWorkers=2` (rtk rewrites `npx`; parallel workers crash on Windows). Judge by the printed `Tests` line, not the exit code. Before finishing a task also run `pnpm run build` (vitest does not type-check).
- jsdom has no `setPointerCapture`, `DragEvent` or `BroadcastChannel` guarantees: feature-check in code, and in tests build events with `createEvent` + `Object.defineProperty` when `clientX` is dropped.

## Review Focus

Failure modes the spec implies that a person would hit; each has its test in the named task.

1. A stored placement that is invalid JSON, the wrong shape, or an unknown side must fall back to docked-right and visible, never a blank page (Task 1).
2. A drag that is cancelled, released outside the window, or ended with Escape must not change the side (Task 3).
3. A blocked popup (`window.open` returns `null`) must leave the chat docked and show a notice, not strand the page in popped-out (Task 7).
4. A pop-out closed with the OS close button, or the main page reloaded while it is open, must end with the chat in a sensible place (Task 7).
5. Saved window bounds that are malformed, zero-sized or non-numeric must be ignored in favour of the default size (Task 5).

---

### Task 1: Placement model and persistence

**Files:**
- Modify: `src/config/storageKeys.ts` (add both keys from Global Constraints)
- Create: `src/components/chat/chatPlacement.ts`, `src/components/chat/useChatPlacement.ts`
- Test: `src/components/chat/__tests__/useChatPlacement.test.ts`

**Interfaces:**
- Produces:
  - `type DockSide = 'left' | 'right'`; `interface ChatPlacement { side: DockSide; hidden: boolean }`
  - `const DEFAULT_PLACEMENT: ChatPlacement` = `{ side: 'right', hidden: false }`
  - `parsePlacement(raw: string | null): ChatPlacement`
  - `useChatPlacement(): { placement: ChatPlacement; hide(): void; show(): void; setSide(side: DockSide): void; swapSide(): void }`

- [ ] **Step 1: Write the failing tests** in `useChatPlacement.test.ts`, following `src/components/rail/__tests__/useRailPosition.test.ts`:
  - `defaults to docked right and visible when nothing is stored`
  - `parsePlacement returns DEFAULT_PLACEMENT for invalid JSON, 'null', '[]', an unknown side, and a non-boolean hidden` (inputs: `'{'`, `'null'`, `'[]'`, `'{"side":"top","hidden":false}'`, `'{"side":"left","hidden":"yes"}'`)
  - `reads a stored placement` (`{"side":"left","hidden":true}` → `{ side: 'left', hidden: true }`)
  - `hide, show and swapSide each persist to STORAGE_KEYS.LOCAL_CHAT_PLACEMENT`
  - `still changes for the session when localStorage.setItem throws` (spy as in the rail test)
- [ ] **Step 2: Run to verify it fails** (module not found). Expected: FAIL.
- [ ] **Step 3: Implement** both files. Mirror `src/components/rail/useRailPosition.ts`: lazy `useState` initialiser from storage via `parsePlacement`, writes wrapped in try/catch, state updated even if the write throws.
- [ ] **Step 4: Run to verify it passes.** Expected: all tests in the file pass.
- [ ] **Step 5: Commit** `feat: add persisted chat placement state`.

---

### Task 2: `ChatDock` — side-aware layout, hide/show, tab strip

**Files:**
- Create: `src/components/chat/chatLayout.ts`, `ChatSource.tsx`, `ChatHeader.tsx`, `ChatTab.tsx`, `ChatDock.tsx`
- Modify: `src/pages/TwitchPlayerPage.tsx` (delete the ratio state, `containerRef`, resize handlers and the chat block; render `<ChatDock channel={channel} player={...} />` where the top row was; keep everything below the row untouched)
- Test: `src/components/chat/__tests__/chatLayout.test.ts`, `ChatDock.test.tsx`

**Interfaces:**
- Consumes: `useChatPlacement`, `DockSide` (Task 1); `ResizableHandle` from `src/components/layout/ResizableHandle.tsx`; `TwitchChatEmbed` from `src/components/channel/TwitchChatEmbed.tsx`.
- Produces:
  - `chatLayout.ts`: `DEFAULT_RATIO = 0.8`, `MIN_RATIO = 0.5`, `MAX_RATIO = 0.92`; `loadRatio(): number` (same fallbacks as today's `loadRatio` in the page); `nextRatio(prev: number, deltaX: number, containerWidth: number, side: DockSide): number` (player ratio; dragging right grows it when `side === 'right'`, shrinks it when `'left'`; clamped).
  - `ChatSource({ channel }: { channel: string })` renders `TwitchChatEmbed`. The only place chat content is chosen.
  - `ChatDock({ channel, player }: { channel: string | undefined; player: ReactNode })`
  - `ChatHeader({ side, onHide, onSwapSide }: { side: DockSide; onHide(): void; onSwapSide(): void })` with buttons labelled `Hide chat` and `Move chat to the left` / `Move chat to the right`; wrapper has classes `hidden md:flex`.
  - `ChatTab({ side, label, onClick }: { side: DockSide; label: string; onClick(): void })`, a 32px-wide strip button.
  - Test ids: `chat-dock` (outer row), `chat-player` (player wrapper), `chat-panel`.

- [ ] **Step 1: Write the failing tests.**
  - `chatLayout.test.ts`: `loadRatio` gives `0.8` for missing, `'abc'`, `'0.2'`, `'0.99'` and the stored value for `'0.7'`; `nextRatio(0.8, 100, 1000, 'right') === 0.9`, `nextRatio(0.8, 100, 1000, 'left') === 0.7`, and both clamp at `0.5` / `0.92`.
  - `ChatDock.test.tsx` (stub `player` as `<div>player</div>`): `docks the chat on the right by default` (`chat-dock` lacks `md:flex-row-reverse`); `docks the chat on the left after Move chat to the left` (has `md:flex-row-reverse`, and the choice is in `localStorage`); `Hide chat removes the chat iframe and shows a Show chat tab`; `clicking Show chat brings the chat back`; `stays hidden when the channel prop changes` (rerender); `the tab and the chat panel are never inside the player wrapper` (`expect(getByTestId('chat-player')).not.toContainElement(...)` for the tab, and for the panel); `shows No channel when channel is undefined`; `placement controls are hidden below md` (header wrapper has `hidden md:flex`).
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** `chatLayout.ts` (move `loadRatio` / clamp logic out of the page unchanged except the side sign), then `ChatSource`, `ChatHeader`, `ChatTab`, `ChatDock`. `ChatDock` uses `md:flex-row-reverse` when `side === 'left'`; renders the `ResizableHandle` only when the chat is visible; when hidden, the player wrapper is `flex: 1 1 0%` and a `ChatTab` is a sibling column on the dock side; the persisted-ratio write (`localStorage.setItem(LOCAL_PANEL_RATIO, ratio.toFixed(3))` on resize end) is carried over verbatim. Update `TwitchPlayerPage` last.
- [ ] **Step 4: Run** `chatLayout.test.ts`, `ChatDock.test.tsx`, then the full suite and `pnpm run build`. Expected: all pass, build prints `built in`.
- [ ] **Step 5: Manual check** on `http://localhost:5000/twitch/<live channel>`: chat looks and resizes exactly as before; Hide, Show and the side swap work; the split ratio survives a reload.
- [ ] **Step 6: Commit** `feat: dock the chat on either side with hide/show`.

---

### Task 3: Drag to dock with plain snapping

**Files:**
- Create: `src/components/chat/useDockDrag.ts`
- Modify: `src/components/chat/chatLayout.ts` (add `sideForPoint`), `ChatHeader.tsx` (a drag handle element using `dragHandleProps`), `ChatDock.tsx`
- Test: `src/components/chat/__tests__/useDockDrag.test.tsx`, `chatLayout.test.ts`

**Interfaces:**
- Consumes: `DockSide` (Task 1), `ChatHeader` / `ChatDock` (Task 2).
- Produces:
  - `sideForPoint(clientX: number, viewportWidth: number): DockSide` (`'left'` when `clientX < viewportWidth / 2`, else `'right'`).
  - `useDockDrag(onDrop: (side: DockSide) => void): { dragging: boolean; hoverSide: DockSide | null; handleProps: HTMLAttributes<HTMLElement> }`; `handleProps` carries the four pointer handlers and `style: { touchAction: 'none', cursor: 'grab' }`.
  - `ChatHeader` gains prop `dragHandleProps: HTMLAttributes<HTMLElement>`; `ChatDock` passes `useDockDrag(setSide).handleProps`.

- [ ] **Step 1: Write the failing tests.** `sideForPoint(499, 1000) === 'left'`, `(500, 1000) === 'right'`. In `useDockDrag.test.tsx`, render a tiny harness with the handle: `releasing on the left half calls onDrop('left')`; `releasing on the right half calls onDrop('right')`; `dragging and hoverSide follow pointermove`; **Review Focus 2:** `pointercancel does not call onDrop`, `releasing outside the window (clientX < 0 or > innerWidth, or clientY outside) does not call onDrop`, `Escape during the drag cancels it`; all three end with `dragging === false`.
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** `sideForPoint` and `useDockDrag`. Use pointer capture as `ResizableHandle` does, feature-checked (`el.setPointerCapture?.(id)`). Listen for `keydown` Escape on `window` only while dragging. No ghost element, no overlay.
- [ ] **Step 4: Run** the new tests, the full suite and `pnpm run build`. Expected: pass.
- [ ] **Step 5: Manual check:** drag the chat header handle across the video, including while the cursor is over the player iframe, and release on each half; the side changes and autoplay is unaffected.
- [ ] **Step 6: Commit** `feat: drag the chat to the other side with plain snapping`.

---

### Task 4: Spike 1, then drop zones (gated)

**Files:**
- Create (only if the spike allows): `src/components/chat/DropZones.tsx`, `__tests__/DropZones.test.tsx`
- Modify: `ChatDock.tsx`; `docs/superpowers/specs/2026-11-04-chat-placement-design.md` (record the spike result)

**Interfaces:**
- Consumes: `DockSide`; `useDockDrag().dragging` / `.hoverSide` (Task 3).
- Produces: `DropZones({ hoverSide, variant }: { hoverSide: DockSide | null; variant: 'over-video' | 'edge' })`; zones have `pointer-events-none`, the hovered one has `data-active="true"`.

- [ ] **Step 1: Run Spike 1 in the owner's foreground Chrome** on a live channel that is already playing. In the console, draw a translucent box over half the player for 15 seconds and watch whether the stream keeps playing:
  ```js
  const f=document.querySelector('iframe[src*="player.twitch.tv"]'),r=f.getBoundingClientRect(),d=document.createElement('div');Object.assign(d.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width/2+'px',height:r.height+'px',background:'rgba(57,255,20,.25)',zIndex:50,pointerEvents:'none'});document.body.appendChild(d);setTimeout(()=>d.remove(),15000)
  ```
- [ ] **Step 2: Decide and record.** Keeps playing → `variant = 'over-video'`. Pauses or errors → `variant = 'edge'` (a highlight along the page edge, outside the player rect). If either variant turns out to be more than a small amount of work, **skip Steps 3–6**, write "plain snapping ships" in the spec's Spikes section, and commit that. Commit the recorded result either way (`docs: record spike 1`).
- [ ] **Step 3: Write the failing tests** (only if continuing): `renders nothing visible when hoverSide is null`; `marks the hovered side active`; `every zone is pointer-events-none`; for `variant='edge'`, `zones are not inside the player wrapper` (render inside `ChatDock` with a drag in progress); `ChatDock renders DropZones only while dragging`.
- [ ] **Step 4: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 5: Implement** `DropZones` and mount it in `ChatDock` while `dragging`. Keep the drop rule from Task 3; zones are feedback only.
- [ ] **Step 6: Run** tests and build, then repeat Task 3's manual drag check, plus confirm a playing embed keeps playing mid-drag. Commit `feat: show drop zones while dragging the chat`.

---

### Task 5: Pop-out protocol, bounds and URL

**Files:**
- Create: `src/lib/chatPopout.ts`
- Test: `src/lib/__tests__/chatPopout.test.ts`

**Interfaces:**
- Produces:
  - `POPOUT_WINDOW_NAME = 'prism-chat-popout'`
  - `type PopoutMessage = { type: 'hello'; channel: string } | { type: 'ping' } | { type: 'set-channel'; channel: string } | { type: 'close' } | { type: 'closed' }` (`hello` is pop-out → main, also the reply to `ping`; `close`, `set-channel`, `ping` are main → pop-out; `closed` is pop-out → main)
  - `interface PopoutBus { post(msg: PopoutMessage): void; subscribe(cb: (msg: PopoutMessage) => void): () => void; close(): void }`; `createPopoutBus(): PopoutBus` (over `BroadcastChannel`; a no-op bus when `BroadcastChannel` is undefined)
  - `interface WindowBounds { width: number; height: number; left: number; top: number }`; `loadBounds(): WindowBounds | null`; `saveBounds(b: WindowBounds): void`
  - `boundsToFeatures(b: WindowBounds | null): string` → `'popup=yes,width=…,height=…,left=…,top=…'`, default size `420 x 720` with no left/top when `null`
  - `buildPopoutUrl(channel: string): string` → `` `/chat/${encodeURIComponent(channel)}` `` (one function so the Twitch-URL fallback is a one-line change)

- [ ] **Step 1: Write the failing tests.** **Review Focus 5:** `loadBounds returns null for malformed JSON, non-numeric fields, NaN, and a width or height below 200`; `loadBounds returns the saved bounds`; `saveBounds then loadBounds round-trips`; `saveBounds does not throw when localStorage.setItem throws`; `boundsToFeatures(null)` contains `width=420,height=720`; `boundsToFeatures` for saved bounds contains all four values; `buildPopoutUrl encodes the channel`; with `vi.stubGlobal('BroadcastChannel', FakeChannel)` `createPopoutBus` posts on, and delivers from, a channel named `'prism-chat-popout'`, and `subscribe` returns an unsubscribe; with the global removed `createPopoutBus` returns a bus whose methods do nothing and do not throw.
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/chatPopout.ts`. A saved window with `left` / `top` of 0 or negative is valid (second monitors); only reject non-finite numbers and sizes under 200.
- [ ] **Step 4: Run** the file and `pnpm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat: add the chat pop-out protocol and window bounds helpers`.

---

### Task 6: `ChatPopoutPage` and its route

**Files:**
- Create: `src/pages/ChatPopoutPage.tsx`
- Modify: `src/App.tsx` (add `<Route path="chat/:channel" element={<ChatPopoutPage />} />` as a **sibling of** the `<Route element={<AppLayout />}>` block so none of the page chrome mounts)
- Test: `src/pages/__tests__/ChatPopoutPage.test.tsx`

**Interfaces:**
- Consumes: `ChatSource` (Task 2); `PopoutBus`, `createPopoutBus`, `saveBounds` (Task 5).
- Produces: `ChatPopoutPage({ bus }: { bus?: PopoutBus })`, `bus` defaulting to `createPopoutBus()`; renders only `ChatSource` filling the viewport (`h-screen`).

- [ ] **Step 1: Write the failing tests** (fake bus; wrap in `MemoryRouter` with route `/chat/:channel`): `posts hello with the channel on mount`; `answers ping with hello`; `set-channel switches the chat to the new channel and the URL` (iframe `title` is `<new> Twitch chat`); `close calls window.close`; `pagehide posts closed and saves the window bounds` (set `outerWidth` / `outerHeight` / `screenX` / `screenY` with `Object.defineProperty`); `resize saves bounds`; `samples bounds every second only when they changed` (fake timers); `sets document.title to "<channel> chat"`. Plus an App-level test: `serves /chat/:channel with only the chat (no banner, no rail)` (push `/chat/somechannel` onto `window.history`, render `<App />`, expect the chat iframe and no `banner` role).
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** `ChatPopoutPage` and the route. Unsubscribe and clear timers on unmount.
- [ ] **Step 4: Run** tests, full suite and `pnpm run build`. Expected: pass.
- [ ] **Step 5: Manual check:** open `http://localhost:5000/chat/<channel>` directly; it shows only that channel's chat and Twitch's chat embed loads there (**Spike 2**). If it does not load, change `buildPopoutUrl` to return `https://www.twitch.tv/popout/<channel>/chat?popout=`, drop the follow and bounds behaviour from Task 7, and record that in the spec.
- [ ] **Step 6: Commit** `feat: add the chat pop-out page`.

---

### Task 7: `useChatPopout` and the pop-out controls

**Files:**
- Create: `src/components/chat/useChatPopout.ts`
- Modify: `ChatHeader.tsx` (add `onPopOut: () => void` and a `Pop out chat` button), `ChatDock.tsx`
- Test: `src/components/chat/__tests__/useChatPopout.test.ts`, extend `ChatDock.test.tsx`

**Interfaces:**
- Consumes: Task 5 exports; `ChatDock` / `ChatTab` (Task 2).
- Produces: `useChatPopout(channel: string | undefined, bus?: PopoutBus): { isOpen: boolean; blocked: boolean; open(): void; close(): void }`.
  - `open()` runs `window.open(buildPopoutUrl(channel), POPOUT_WINDOW_NAME, boundsToFeatures(loadBounds()))` synchronously; a `null` result sets `blocked = true`, `isOpen` stays false.
  - `isOpen` becomes true on `hello`, false on `closed`; while a window reference exists, poll `ref.closed` every 1000 ms.
  - On mount post `{ type: 'ping' }`; a `hello` reply sets `isOpen` with no window reference, and `close()` then posts `{ type: 'close' }`.
  - While open, a changed `channel` posts `{ type: 'set-channel', channel }`.
  - Unmount closes the bus and stops polling but leaves the window open.
  - In `ChatDock`, `isOpen` hides the chat panel and shows a `ChatTab` labelled `Return chat to the page` (calls `close()`); `blocked` shows an element with `role="status"` and the text `Pop-up blocked. Allow pop-ups for this site to use the chat window.`

- [ ] **Step 1: Write the failing tests** (fake bus, `vi.spyOn(window, 'open')` returning `{ closed: false, close: vi.fn() }`, fake timers). Hook: `open() calls window.open with the pop-out URL, the shared name and the saved bounds`; **Review Focus 3:** `a null window.open result sets blocked and keeps isOpen false`; `hello sets isOpen and closed clears it`; **Review Focus 4:** `polling notices popup.closed becoming true without a closed message`, `on mount a ping is posted; a hello reply marks it open with no window reference; close() then posts close`, `a second mount re-attaches through ping and hello`; `a channel change posts set-channel only while open`; `unmount closes the bus and stops polling but does not close the window`. `ChatDock` (mock `../useChatPopout` with `vi.mock`): `the Pop out chat button calls open`; `while open the chat panel is gone and Return chat to the page is shown`; `returning calls close and the chat is back on the same side`; `a blocked popup shows the status message and the chat stays docked`.
- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the hook and wire the button, tab and notice into `ChatDock`. Keep `popped-out` out of storage: it is `useChatPopout().isOpen`, nothing else.
- [ ] **Step 4: Run** tests, full suite and `pnpm run build`. Expected: pass.
- [ ] **Step 5: Manual check:** pop out, move the window onto another monitor, close it with the OS button (chat returns), reload the main page with the pop-out open (it re-attaches), navigate to another channel (the pop-out follows).
- [ ] **Step 6: Commit** `feat: pop the chat out into its own window`.

---

### Task 8: Acceptance run and close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-chat-placement-design.md` (Status, Spikes results); memory notes.

- [ ] **Step 1: Autoplay oracle, in the owner's foreground Chrome** on a live channel, once per state: docked right, docked left, hidden, popped out with the pop-out window **placed over the video**, and mid-drag with zones shown if Task 4 built them. Console:
  ```js
  const f=document.querySelector('iframe[src*="player.twitch.tv"]');new IntersectionObserver(e=>console.log('visible',e.at(-1).isVisible),{trackVisibility:true,delay:100,threshold:[0,1]}).observe(f)
  ```
  Expected: `visible true` in every state, and the stream autoplays after a fresh load in each.
- [ ] **Step 2: Spike 3:** save a pop-out position on a second monitor, disconnect or move that monitor, reopen the pop-out; record whether the window is clamped onto a visible screen.
- [ ] **Step 3: Deployed-path check (after the owner merges and deploys):** load `https://prism.nooroticx.tv/chat/<channel>` directly; `public/404.html` should route it like the other pages.
- [ ] **Step 4:** Run the full suite, `pnpm run build` and `pnpm run lint`; expect no new failures or warnings.
- [ ] **Step 5:** Update the spec's Status and Spikes sections with the results, and the project memory notes. Commit `docs: record the chat placement acceptance results`.
- [ ] **Step 6:** Ask the owner whether to push and open the PR(s). Suggested split: Tasks 1–4 (dock) and Tasks 5–7 (pop-out).
