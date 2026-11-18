# Header Nav Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Twitch-only header with section tabs (Twitch / YouTube / HLS/DASH), a second row that folds away (section tools or Accounts), an Accounts control with per-platform status, and a paste box behind a link icon.

**Architecture:** Two pure modules hold the rules: `headerSections.ts` (which section a path is in, where the paste box shows) and `headerRow.ts` (a reducer for "which row is open, previewed or pinned"). A hook, `useHeaderRow`, drives that reducer from hover timers, presses, Esc, outside clicks, route changes and the header hiding. `Header.tsx` composes small components (tabs, folding row, Twitch tools, Accounts pill/row, paste toggle). Nothing new draws over the page: the row and the paste box's suggestion list live in the header's flow, so the header grows and `useHeaderHeight` publishes it. The YouTube import moves out of `useCatchup` into `youtubeImport.ts`, so the header can import without loading Catch up.

**Tech Stack:** React 19, TypeScript, Tailwind v4, react-router 7, lucide-react, Vitest + Testing Library (jsdom, which has `PointerEvent` with `pointerType`).

**Spec:** `docs/superpowers/specs/2026-11-18-header-nav-refactor-design.md` (approved 2026-11-18). Read it before each task.

## Global Constraints

- Commit messages carry **no** `Co-Authored-By` line (that goes in the PR description only).
- Run tools directly, not through the rtk wrapper's rewrites:
  - tests: `node ./node_modules/vitest/vitest.mjs run <path>`
  - types: `node ./node_modules/typescript/bin/tsc -b`
  - lint: `node ./node_modules/eslint/bin/eslint.js .`
  - build: `node ./node_modules/vite/bin/vite.js build`
- Judge a run by its output, never by its exit code.
- `<header>` keeps the class `fill-hide` and `useHeaderHeight(ref)` on the `<header>` element itself.
- The top bar keeps `min-h-14`, so the folded header is 56 px at every width.
- Nothing the header adds may be `absolute` or `fixed` over the page. The Browse dropdown and the slide-down panels keep their existing overlay (a non-goal). The phone paste box covers the **bar's own contents** only.
- Exactly one element in the document carries `data-nav-trigger`: the one holding Following / Your Stats / Browse.
- The header never calls `useCatchup()`. No YouTube sign-out control exists anywhere.
- The history link is exactly `https://www.youtube.com/feed/history`, with `target="_blank"` and `rel="noopener noreferrer"`.
- Timings: hover open `200` ms; hover close `350` ms; row animation `180` ms; none under `prefers-reduced-motion`.
- Breakpoint: `640px` (Tailwind `sm`). The folded bar must fit on one row at `360px`.
- Colours: the `PROTOCOL_META` colours (`var(--accent-twitch)`, `var(--accent-youtube)`, `var(--accent-hls)`) and the existing tokens. Accent `var(--accent-green)`.

## Review Focus

1. **Twitch says signed in, but the profile hasn't loaded yet** (`isAuthenticated` true, `auth.user` null). The pill shows the Twitch dot (no broken `<img>`), and the row says "Signed in". Test in Task 6.
2. **A YouTube record with an empty title and picture** (the channel lookup failed). The pill shows the red ▶; the row reads "{n} subscriptions, imported {date}". Test in Task 6.
3. **Subscriptions stored but no account record** (imported before 61e9861, or a damaged record). This counts as imported: "{n} subscriptions imported", with no date. Test in Task 2 (hook) and Task 6 (copy).
4. **The page changes while the paste box is open with text in it.** The box closes and the row folds; nothing stays drawn. Test in Task 7.
5. **The viewer clicks into the Twitch or YouTube player while a row is pinned.** Iframe clicks never reach `document`, but the row still folds. Test in Task 4.

---

### Task 1: Check first — does pushing the player down pause Twitch?

Throwaway check (spec, "Check first"). Nothing from it is committed. **If Twitch pauses, stop here and report to the owner.**

**Files:**
- Create (untracked): `.claude/launch.json` in this worktree. Use name `prism-header-dev`, `node ./node_modules/vite/bin/vite.js --port 5010 --strictPort`, port `5010`. Confirm it is untracked with `git status --short`.
- Temporarily modify: `src/components/layout/Header.tsx`

- [ ] **Step 1:** Inside `<header>`, after the existing content, add a throwaway `<div>`. Its height toggles between `0` and `48px` every 4 s (`setInterval` in an effect), with `transition: height 180ms`, so `useHeaderHeight` republishes on every frame.
- [ ] **Step 2:** `preview_start` with `prism-header-dev`. Open `/twitch/<a channel that is live now>`, start playback, and watch 60 s at a short window (`resize_window` 1280×600) and at 375×812.
- [ ] **Step 3:** Pass means the player keeps playing through about 15 pushes.
  - Check by the debug overlay's player state (⚙) and by screenshots 4 s apart: the video frame changes.
  - Fail means a pause, or "click to play".
- [ ] **Step 4:** `git checkout -- src/components/layout/Header.tsx`, then `git status --short` shows only `.claude/launch.json` as untracked.

---

### Task 2: The YouTube import, shared

**Files:**
- Create: `src/lib/youtubeImport.ts`, `src/hooks/useYoutubeAccount.ts`
- Modify: `src/hooks/useCatchup.ts` (its import body, `importing`, `account`)
- Test: `src/lib/__tests__/youtubeImport.test.ts`, `src/hooks/__tests__/useYoutubeAccount.test.tsx`, `src/hooks/__tests__/useCatchup.test.tsx` (all existing tests stay unchanged and green; one added)

**Interfaces:**
- Consumes: `requestYoutubeReadToken`, `GoogleAuthError`, `isGoogleAuthConfigured` (`googleYoutubeAuth.ts`); `listSubscriptions`, `getMyChannel` (`catchupApi.ts`); `getAccount`, `setAccount`, `getSubscriptions`, `setSubscriptions`, `StoredAccount` (`catchupStore.ts`); `STORAGE_KEYS.LOCAL_CATCHUP_ACCOUNT`, `STORAGE_KEYS.LOCAL_CATCHUP_SUBSCRIPTIONS`.
- Produces:

```ts
// src/lib/youtubeImport.ts
export type ImportResult = { status: 'done' } | { status: 'busy' } | { status: 'failed'; message: string }
/** Token → listSubscriptions → getMyChannel (its failure keeps the import, title '') → setSubscriptions + setAccount.
 *  A call while one runs returns { status: 'busy' } at once. Never throws. */
export function importYoutubeSubscriptions(): Promise<ImportResult>
export interface YoutubeImportSnapshot { importing: boolean; /** +1 after each successful import, here or in another tab. */ revision: number }
export function getYoutubeImportSnapshot(): YoutubeImportSnapshot   // same object until something changes
export function subscribeYoutubeImport(listener: () => void): () => void
/** The wording useCatchup shows today, moved here unchanged. */
export function importFailureMessage(err: unknown): string

// src/hooks/useYoutubeAccount.ts
export interface YoutubeAccountView {
  importing: boolean
  revision: number
  account: StoredAccount | null
  subscriptionCount: number
  /** account !== null || subscriptionCount > 0 */
  imported: boolean
  configured: boolean
}
export function useYoutubeAccount(): YoutubeAccountView
```

- [ ] **Step 1: Write the failing tests** in `youtubeImport.test.ts`. Mock `catchupApi` and `googleYoutubeAuth` the way `useCatchup.test.tsx` does, and use `localStorage.clear()` in `beforeEach`.
  - `stores the list and the account, returns done, and bumps the revision once`: with token `'tok'`, list `[{id:'UCnew',title:'New'}]` and channel `{title:'NooRotic',thumbnailUrl:'https://img/d.jpg'}`. Expect `getSubscriptions()` to equal the list, `getAccount()` to match `{title:'NooRotic', thumbnailUrl:'https://img/d.jpg', importedAt: expect.any(Number)}`, and the revision to be `before + 1`.
  - `keeps the import when the channel lookup fails`: `getMyChannel` rejects. Expect `getAccount()?.title === ''` and the subscriptions stored.
  - `answers busy at once while one runs, without asking Google again`: the first token promise is pending. The second call resolves `{status:'busy'}`, and `requestYoutubeReadToken` was called once.
  - `leaves stored data alone and explains a closed sign-in`: rejects with `GoogleAuthError('closed')`. Expect `{status:'failed', message:'The Google sign-in window was closed, so nothing was imported.'}` and storage unchanged.
  - `tells listeners when it starts and ends`: the snapshot's `importing` is `true` while pending and `false` after.
  - `counts another tab's import once`: use fake timers. Dispatch `new StorageEvent('storage',{key:'prism_catchup_subscriptions'})` and then one with `key:'prism_catchup_account'` within 50 ms, with a listener subscribed. After `vi.advanceTimersByTime(150)`, the revision is `+1`. A `storage` event for another key changes nothing.
- [ ] **Step 2: Write the failing tests** in `useYoutubeAccount.test.tsx`:
  - `counts a list without an account record as imported`: store 3 subscriptions and no account. Expect `{imported:true, account:null, subscriptionCount:3}`.
  - `re-reads after an import`: after `await importYoutubeSubscriptions()` (mocked to succeed) inside `act`, `account.title` is `'NooRotic'`.
  - `configured follows isGoogleAuthConfigured`.
- [ ] **Step 3: Add the failing test** to `useCatchup.test.tsx`, under `describe('useCatchup: an import started elsewhere')`:
  - `refreshes once`: mount, wait for `ready`, and note `mS.mock.calls.length`. Then `await importYoutubeSubscriptions()` (mocked to succeed) in `act`. `waitFor` the count to be `+1`; it stays `+1` after another tick.
- [ ] **Step 4: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/youtubeImport.test.ts src/hooks/__tests__/useYoutubeAccount.test.tsx src/hooks/__tests__/useCatchup.test.tsx`. Expected: the new tests FAIL (the module is missing); the old `useCatchup` tests PASS.
- [ ] **Step 5: Implement `youtubeImport.ts`.**
  - Module state: `{ importing, revision }`. Replace the object on each change, so `useSyncExternalStore` sees it.
  - Attach a `window` `storage` listener the first time anyone subscribes. Filter to the two keys, with a 100 ms debounce.
- [ ] **Step 6: Implement `useYoutubeAccount`** with `useSyncExternalStore(subscribeYoutubeImport, getYoutubeImportSnapshot)`. Read `getAccount()` and `getSubscriptions().length` in a `useMemo` keyed on `revision`.
- [ ] **Step 7: Rewire `useCatchup`.**
  - `importing` comes from the snapshot, and `account` is re-read on `revision`.
  - `importSubscriptions()` sets a `selfImport` ref and awaits `importYoutubeSubscriptions()`:
    - `'done'`: `await refresh()`, as today;
    - `'failed'`: `setActionNotices([message])`;
    - `'busy'`: return.
  - An effect on `revision` (skipping the first value, and skipping the bump its own import caused) calls `refresh()` once.
  - Delete the now-unused local import code. Keep `CatchupState` unchanged.
- [ ] **Step 8: Run** the command from Step 4. Expected: all PASS, including the untouched `useCatchup: import in progress` test.
- [ ] **Step 9: Commit:** `git add src/lib/youtubeImport.ts src/hooks/useYoutubeAccount.ts src/hooks/useCatchup.ts src/lib/__tests__/youtubeImport.test.ts src/hooks/__tests__/useYoutubeAccount.test.tsx src/hooks/__tests__/useCatchup.test.tsx`, then `git commit -m "refactor(catchup): one shared YouTube import the header can start too"`

---

### Task 3: Sections and the row's rules (pure)

**Files:**
- Create: `src/lib/headerSections.ts`, `src/lib/headerRow.ts`
- Test: `src/lib/__tests__/headerSections.test.ts`, `src/lib/__tests__/headerRow.test.ts`

**Interfaces:**
- Consumes: `PROTOCOL_META` (`src/config/demoContent.ts`).
- Produces:

```ts
// headerSections.ts
export type SectionId = 'twitch' | 'youtube' | 'hls-dash'
export interface SectionDef { id: SectionId; path: string; label: string; shortLabel: string; color: string; hasTools: boolean }
/** Order and copy: Twitch '/twitch' (tools), YouTube '/youtube' (tools), HLS/DASH '/hls-dash' shortLabel 'HLS' (no tools). */
export const SECTIONS: readonly SectionDef[]
export function sectionForPath(pathname: string): SectionId | null
/** True everywhere except '/', '/twitch', '/youtube' (those pages have their own paste box), as Header decides today. */
export function showsHeaderPaste(pathname: string): boolean

// headerRow.ts
export type ToolsRowId = 'twitch' | 'youtube'
export type RowId = ToolsRowId | 'accounts'
export interface RowState { open: RowId | null; pinned: boolean }
export const ROW_CLOSED: RowState
export type RowEvent =
  | { type: 'hoverOpen'; row: ToolsRowId }
  | { type: 'hoverClose' }
  | { type: 'press'; row: RowId }
  | { type: 'dismiss' }   // Esc, page change, header hidden: always closes
  | { type: 'outside' }   // click outside the header or into a player
export function nextRow(state: RowState, event: RowEvent, held: boolean): RowState
```

- [ ] **Step 1: Write the failing tests.**
  - `sectionForPath` as an `it.each` table:
    - `'/'→null`, `'/twitch'→'twitch'`, `'/twitch/foo'→'twitch'`, `'/twitchy'→null`
    - `'/youtube/catchup'→'youtube'`, `'/hls-dash'→'hls-dash'`, `'/hls-dash/0123456789ab'→'hls-dash'`, `'/nope'→null`
  - `showsHeaderPaste`: `true` for the six paths in `Header.pasteBox.test.tsx` and for `'/youtube/catchup'`; `false` for `'/'`, `'/twitch'`, `'/youtube'`.
  - `SECTIONS`: labels `['Twitch','YouTube','HLS/DASH']`, `shortLabel` of `hls-dash` is `'HLS'`, `hasTools` is `[true,true,false]`.
  - `nextRow`, one `it` per rule:
    - `hoverOpen` from closed gives `{open:'twitch',pinned:false}`.
    - `hoverOpen` while pinned, or while held, changes nothing.
    - `hoverClose` closes a previewed row; it does nothing when pinned or held.
    - `press` on the previewed same row gives `{open:row, pinned:true}`.
    - `press` on the pinned same row closes it.
    - `press` on another row gives `{open:other, pinned:true}`, even when held.
    - `dismiss` always closes.
    - `outside` closes when not held, and does nothing when held.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/headerSections.test.ts src/lib/__tests__/headerRow.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement both modules.** `sectionForPath` matches `^/(twitch|youtube|hls-dash)(/|$)`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/lib/headerSections.ts src/lib/headerRow.ts src/lib/__tests__/headerSections.test.ts src/lib/__tests__/headerRow.test.ts`, then `git commit -m "feat(header): section and folding-row rules"`

---

### Task 4: `useHeaderRow` — timers, presses, Esc, outside clicks

**Files:**
- Create: `src/hooks/useHeaderRow.ts`
- Test: `src/hooks/__tests__/useHeaderRow.test.tsx`

**Interfaces:**
- Consumes: `nextRow`, `RowState`, `RowId`, `ToolsRowId`, `ROW_CLOSED` (Task 3); `useLocation`.
- Produces:

```ts
export const HOVER_OPEN_DELAY_MS = 200
export const HOVER_CLOSE_DELAY_MS = 350
export interface HeaderRowHolds { navPanelOpen: boolean; browseOpen: boolean; importing: boolean }
export interface HeaderRow {
  state: RowState
  /** On each tab that has tools. Mouse pointers only (pointerType === 'mouse'). */
  tabHoverProps(row: ToolsRowId): { onPointerEnter(e: React.PointerEvent): void; onPointerLeave(e: React.PointerEvent): void }
  /** On the folding row: entering it keeps a previewed row open, leaving starts the close delay. */
  rowHoverProps: { onPointerEnter(e: React.PointerEvent): void; onPointerLeave(e: React.PointerEvent): void }
  /** A ▾ or the Accounts pill. `trigger` gets focus back when Esc folds the row. */
  press(row: RowId, trigger?: HTMLElement | null): void
  /** Attach to the folding row: focus inside it holds the row open (focusin/focusout). */
  rowRef: React.RefObject<HTMLDivElement | null>
}
export function useHeaderRow(headerRef: React.RefObject<HTMLElement | null>, holds: HeaderRowHolds): HeaderRow
```

- Behaviour that the tests pin:
  - `held = navPanelOpen || browseOpen || importing || focusInsideRow`.
  - **Esc** (a `document` `keydown`): read the holds from a ref at keydown. If a nav panel or Browse is open, leave the Esc to them. Otherwise, if a row is open, `dismiss` and focus the last `trigger`.
  - **Outside:** a `document` `pointerdown` whose target is outside `headerRef` sends `outside`. So does `window` `blur`, when `document.activeElement` is an `IFRAME` on the next tick.
  - A **page change** (`pathname`) sends `dismiss`.
  - The **header hiding** (a `ResizeObserver` sees `offsetHeight === 0`, as fill mode does) sends `dismiss`.

- [ ] **Step 1: Write the failing tests.** Use a harness component with a `<header ref>` holding two tab buttons, a row `div`, and an outside button, inside a `MemoryRouter`, with fake timers. Fire events with `fireEvent.pointerEnter(el, { pointerType: 'mouse' })`.
  - `opens a tab's row after 200 ms of mouse hover, not before`.
  - `ignores touch pointers` (`pointerType: 'touch'`).
  - `keeps the row while the pointer moves from the tab into it, and folds 350 ms after leaving both`.
  - `pins on press, and folds on Esc with focus back on the trigger`.
  - `leaves Esc to an open panel` (`navPanelOpen: true`).
  - `folds a pinned row on a pointerdown outside the header, not inside it`.
  - `folds when the viewer clicks into a player`: append an `iframe` with `tabIndex=0`, focus it, `fireEvent.blur(window)`, `vi.runOnlyPendingTimers()`; the state is closed. (Review focus 5)
  - `stays open through an outside click while importing`.
  - `folds on a page change` (a link in the harness that navigates).
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useHeaderRow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement `useHeaderRow`** with `useReducer` around `nextRow`. Pass `held` from a ref into the reducer dispatch. Keep one timer ref, cleared on every enter, leave and unmount.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/hooks/useHeaderRow.ts src/hooks/__tests__/useHeaderRow.test.tsx`, then `git commit -m "feat(header): folding row behaviour (hover preview, press to pin, Esc, outside)"`

---

### Task 5: Tabs, the folding row, and the Twitch and YouTube tools in the header

**Files:**
- Create: `src/components/layout/SectionTabs.tsx`, `src/components/layout/FoldingRow.tsx`, `src/components/layout/TwitchTools.tsx`
- Delete: `src/components/layout/HeaderNav.tsx` (its buttons move into `TwitchTools`)
- Modify: `src/components/layout/Header.tsx`, `src/components/search/ChannelSearchDropdown.tsx`, `src/index.css`
- Test: `src/components/layout/__tests__/Header.sections.test.tsx` (new), `Header.test.tsx` (update)

**Interfaces:**
- Consumes: `SECTIONS`, `sectionForPath` (Task 3); `useHeaderRow`, `HeaderRow` (Task 4); `useApp` (`navPanel.open`, `TOGGLE_NAV_PANEL`, `CLOSE_NAV_PANEL`); `useTwitchAuth`.
- Produces:

```tsx
export function SectionTabs(props: { current: SectionId | null; row: HeaderRow }): JSX.Element
// Each tab: <Link to={path} aria-current={current === id ? 'page' : undefined}>. A tab with tools also gets
// <button aria-label={`${label} tools`} aria-expanded aria-controls="header-row"> ▾.
export function FoldingRow(props: { open: boolean; row: HeaderRow; children: React.ReactNode }): JSX.Element
// id="header-row". In flow (no absolute/fixed). Class `header-fold` with `data-open`:
// grid-template-rows 0fr→1fr over 180ms (index.css; no transition under prefers-reduced-motion).
export function TwitchTools(props: { browseOpen: boolean; onBrowseOpenChange(open: boolean): void }): JSX.Element
// Signed in: Following, Your Stats (TOGGLE_NAV_PANEL), Browse (ChannelSearchDropdown); the wrapper has data-nav-trigger.
// Signed out: "Connect Twitch to see Following, Your Stats and Browse" + button "Connect" (login).
// ChannelSearchDropdown gains: anchorRef?: React.RefObject<HTMLElement | null>
//   (a mousedown inside it is not "outside"); the panel anchors `left-0` instead of `right-0`.
```

- Header wiring:
  - It owns `browseOpen`, holds `useHeaderRow(headerRef, { navPanelOpen, browseOpen, importing })`, and renders `<FoldingRow>` holding the open row's content. The YouTube row is `<Link to="/youtube/catchup">Catch up</Link>`.
  - The bar has `data-section={current ?? 'none'}` and a 2 px bottom line in the current section's colour (`SECTIONS[...].color`), or `var(--border)` when there is no section.
  - When the open row changes **from** `'twitch'` to another row, close Browse and dispatch `CLOSE_NAV_PANEL`. Only on that change, because the rail can open Following while the row is closed.
  - The old "connect twitch" / "logout" buttons stay until Task 6 replaces them.

- [ ] **Step 1: Write the failing tests** in `Header.sections.test.tsx`. Render as in `Header.test.tsx`, with `MemoryRouter initialEntries`.
  - `links each section`: hrefs `/twitch`, `/youtube`, `/hls-dash`.
  - `marks the current section`: `aria-current="page"` on Twitch at `/twitch/foo`, on YouTube at `/youtube/catchup`, and on none at `/`.
  - `gives Twitch and YouTube a tools button and HLS/DASH none`: `getByRole('button',{name:'Twitch tools'})`; no `'HLS/DASH tools'` button.
  - `opens the Twitch row from its button`: `aria-expanded` becomes `true`; Following, Your Stats and Browse show (signed in).
  - `asks a signed-out viewer to connect`: shows the exact text; Connect calls `login`.
  - `opens Following from the row`: a state probe shows `navPanel.open === 'following'`; `document.querySelectorAll('[data-nav-trigger]').length === 1`.
  - `closes Following when Accounts replaces the Twitch row`: skip until Task 6 adds the pill (`it.todo` now; enable in Task 6).
  - `shows Catch up in the YouTube row`: href `/youtube/catchup`.
  - `keeps the row in the page flow`: the `#header-row` class string contains neither `absolute` nor `fixed`; the `<header>` keeps `fill-hide`.
  - `underlines the bar in the current section's colour`: `data-section="youtube"` at `/youtube/x` and `"none"` at `/`.
  - `a second click on Browse closes it for good`: `userEvent.click` Browse twice; `queryByPlaceholderText` for the Browse input is null.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/layout/__tests__/Header.sections.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `SectionTabs`, `FoldingRow`, `TwitchTools`, the `ChannelSearchDropdown` change, the `index.css` `.header-fold` rules and the Header wiring. Delete `HeaderNav.tsx`.
- [ ] **Step 4: Update `Header.test.tsx`** only where it pinned `HeaderNav`'s absence when signed out (the tabs now always show). Run `node ./node_modules/vitest/vitest.mjs run src/components/layout/__tests__`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add -A src/components/layout src/components/search/ChannelSearchDropdown.tsx src/index.css`, then `git commit -m "feat(header): section tabs and a folding row for each section's tools"`

---

### Task 6: Accounts — the pill and its row

**Files:**
- Create: `src/components/layout/AccountsPill.tsx`, `src/components/layout/AccountsRow.tsx`, `src/hooks/useMediaQuery.ts`
- Modify: `src/components/layout/Header.tsx` (the pill replaces "connect twitch" / "logout"; the gear moves below 640 px)
- Test: `src/components/layout/__tests__/Header.accounts.test.tsx`, `Header.test.tsx` (update), `Header.sections.test.tsx` (enable the `todo`)

**Interfaces:**
- Consumes: `useYoutubeAccount`, `importYoutubeSubscriptions`, `ImportResult` (Task 2); `HeaderRow.press` (Task 4); `useApp` (`auth.user`, `auth.expired`, `TOGGLE_DEBUG`, `player.debugMode`); `useTwitchAuth` (`login`, `logout`).
- Produces:

```tsx
export function useMediaQuery(query: string): boolean   // useSyncExternalStore, like useLandscapePhone; false without matchMedia
export function AccountsPill(props: { expanded: boolean; onPress(trigger: HTMLElement): void }): JSX.Element
// aria-controls="header-row", aria-expanded, aria-label:
// `Accounts: Twitch ${signedIn ? (name ? `signed in as ${name}` : 'signed in') : 'not signed in'}, YouTube ${imported ? 'subscriptions imported' : 'not imported'}`
// Visible text "Sign in" when neither is connected (below 360 px a User icon stands in for the text).
export function AccountsRow(props: { showDebugToggle: boolean }): JSX.Element
```

- Exact copy:
  - **Twitch:**
    - signed in: `Signed in as {display_name}` (or `Signed in` while `auth.user` is null), with button `Sign out`;
    - signed out: `Not signed in`, with `Connect`;
    - expired: `Your Twitch session ended`, with `Connect`.
  - **YouTube:**
    - with a record: `{n} subscription(s) from {title}, imported {date}`; when the title is empty, `{n} subscription(s), imported {date}`;
    - list but no record: `{n} subscription(s) imported`;
    - never: `Subscriptions not imported`.
    - Button: `Import` / `Re-import`, or `Importing…` (disabled) while importing.
    - Not configured: `Import isn't set up in this build`, and no button.
    - A failed import shows the `message` from `ImportResult`.
    - Link: `History: check on youtube.com ↗`.
    - `{date}` uses the Catch up page's format: `toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })`.
  - **Debug row** (when `showDebugToggle`): label `Debug overlay`, a switch with `aria-label="Toggle debug overlay"` and `aria-pressed`.
- Header: `const wide = useMediaQuery('(min-width: 640px)')`. The bar renders the ⚙ only when `wide`; `AccountsRow showDebugToggle={!wide}`. Exactly one debug toggle is ever in the DOM.

- [ ] **Step 1: Write the failing tests** in `Header.accounts.test.tsx`.
  - Mock `useTwitchAuth` as `Header.test.tsx` does, and `../../../lib/youtubeImport` with `importYoutubeSubscriptions: vi.fn()` plus the real snapshot functions (`importOriginal`).
  - Seed state through `localStorage` (`prism_catchup_account`, `prism_catchup_subscriptions`) and the `AppProvider` auth.
  - To test the wide layout, override `window.matchMedia` to answer `true` for `(min-width: 640px)`.
  - Tests:
    - `shows a signed-in Twitch account with Sign out`: calls `logout`.
    - `asks to connect when signed out, and says so when the session ended` (`expired`).
    - `says Signed in, with no picture, while the profile is loading` (Review focus 1): no `img` in the pill or the row.
    - `describes an import with its account and date` (title `'NooRotic'`, 214 channels).
    - `drops the name and shows ▶ when the record has no title or picture` (Review focus 2).
    - `counts a list imported before account records, without a date` (Review focus 3).
    - `re-imports from the row`: a pending `importYoutubeSubscriptions` shows `Importing…` and disabled; a resolved `failed` shows its message.
    - `has no YouTube sign-out`: within the YouTube entry, no button matches `/sign out|log out|disconnect/i`.
    - `links to the YouTube history in a new tab`: the exact href, `target="_blank"`, `rel` contains `noopener`.
    - `says it is not set up when Google sign-in is missing`.
    - `reads Sign in when nothing is connected`.
    - `puts the debug toggle in the bar when wide and in the Accounts row when narrow, never both`: `getAllByLabelText('Toggle debug overlay').length === 1` in both cases.
  - In `Header.sections.test.tsx`, enable `closes Following when Accounts replaces the Twitch row`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/layout/__tests__/Header.accounts.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `useMediaQuery`, `AccountsPill`, `AccountsRow` and the Header changes. Remove the old connect/logout buttons.
- [ ] **Step 4: Port `Header.test.tsx`** from the "connect twitch" / "logout" buttons to the pill and row. Keep "is marked fill-hide" and the debug toggle test, using the wide `matchMedia`. Run `node ./node_modules/vitest/vitest.mjs run src/components/layout/__tests__`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add -A src/components/layout src/hooks/useMediaQuery.ts`, then `git commit -m "feat(header): Accounts pill and row with Twitch and YouTube status"`

---

### Task 7: The paste box behind a link icon

**Files:**
- Create: `src/components/layout/PasteToggle.tsx`
- Modify: `src/components/search/SmartUrlInput.tsx`, `src/components/layout/Header.tsx`
- Test: `src/components/layout/__tests__/Header.pasteBox.test.tsx` (rewrite), `src/components/search/__tests__/SmartUrlInput.headerMode.test.tsx` (new)

**Interfaces:**
- Consumes: `showsHeaderPaste` (Task 3); `HeaderRow` (Task 4).
- Produces:

```ts
export interface SmartUrlInputProps {
  /** Draw the suggestion list here (a slot in the header's flow) instead of over the page under the box.
   *  Mousedowns inside it count as inside the box. */
  listContainer?: HTMLElement | null
  /** Turning true empties the box and focuses it. */
  active?: boolean
  /** The box is finished with: after any submit (a page, the Category panel, a played URL, a QuickLink,
   *  a suggestion), on Esc, or when focus leaves it while it is empty. */
  onDone?: () => void
}
export function SmartUrlInput(props?: SmartUrlInputProps): JSX.Element   // no props = today's behaviour exactly
export function PasteToggle(props: { open: boolean; onOpenChange(open: boolean): void; listContainer: HTMLElement | null }): JSX.Element
// <button aria-label="Paste a link" aria-expanded>. SmartUrlInput is mounted once and stays mounted, hidden while closed.
// Below 640 px, when open, it covers the bar's own contents (absolute inside the bar, which is `relative`),
// with a button aria-label="Close the paste box".
```

- Header:
  - It renders `<PasteToggle>` when `showsHeaderPaste(pathname)`.
  - It renders a list slot `<div id="header-paste-list" class="max-h-64 overflow-y-auto">` in flow, between the bar and the folding row, and passes it through a callback ref into state. The cap keeps the push modest.
  - Closing the box returns focus to the 🔗 button.
  - A page change closes it.
  - While it is open, the wordmark hides up to 800 px (`max-[800px]:hidden`).

- [ ] **Step 1: Write the failing tests** in `SmartUrlInput.headerMode.test.tsx`. Use the real `SmartUrlInput`, with `AppProvider` and `MemoryRouter`.
  - `draws the quick links into the given container on focus` (they are inside `listContainer`, not inside the box's own element).
  - `opens empty and focused when it becomes active, even with an old search in state` (`SET_QUERY` dispatched first).
  - `calls onDone after a quick link, and the quick link still works`: `OPEN_CATEGORY_PANEL` reached the state; the click was not lost to click-outside.
  - `calls onDone on Esc and on blur while empty, not on blur with text`.
  - `loads the search history once however often it is activated`: spy on dispatch counts for `ADD_HISTORY` after activating twice.
- [ ] **Step 2: Rewrite `Header.pasteBox.test.tsx`.** Keep `SmartUrlInput` mocked as a stub that records its props.
  - `shows the link icon on %s`, for the same six paths plus `/youtube/catchup`; `leaves it to the page on %s` for `/`, `/twitch` and `/youtube`.
  - `opens the box from the icon and gives it the in-flow list slot` (`active` true; `listContainer` is `#header-paste-list`, which is not `absolute`).
  - `closes when the page changes, even with text typed` (Review focus 4).
- [ ] **Step 3: Run** `node ./node_modules/vitest/vitest.mjs run src/components/search/__tests__/SmartUrlInput.headerMode.test.tsx src/components/layout/__tests__/Header.pasteBox.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement** the `SmartUrlInput` props, `PasteToggle` and the Header wiring.
  - Use `createPortal` for `listContainer`.
  - The click-outside check treats `listContainer` as inside.
  - Keep the hub's and the listing pages' boxes unchanged (no props).
- [ ] **Step 5: Run** `node ./node_modules/vitest/vitest.mjs run src/components`. Expected: PASS, including the existing `SmartUrlInput` tests.
- [ ] **Step 6: Commit:** `git add -A src/components/layout src/components/search`, then `git commit -m "feat(header): paste box behind a link icon, its list pushes the page instead of covering it"`

---

### Task 8: One row on a phone

**Files:**
- Modify: `src/components/layout/Header.tsx`, `SectionTabs.tsx`, `AccountsPill.tsx`
- Test: `src/components/layout/__tests__/Header.layout.test.tsx` (rewrite)

**Interfaces:**
- Consumes: all of Tasks 5–7. Produces nothing new.
- Classes the tests pin:
  - **Bar:** `flex flex-nowrap items-center min-h-14 relative`.
  - **Wordmark:** `hidden sm:inline`.
  - **HLS/DASH tab:** the long label is `hidden sm:inline`, and `HLS` is `sm:hidden`.
  - **Below 360 px:** tabs `max-[359px]:px-1.5`; the pill's "Sign in" text is `max-[359px]:hidden`, and its User icon is `min-[360px]:hidden`.
  - **Header padding:** keep `px-3 sm:px-6`.

- [ ] **Step 1: Rewrite the tests** in `Header.layout.test.tsx`. Replace the old wrap-onto-two-rows tests (that design is gone).
  - `keeps the folded header on one row at every width` (`flex-nowrap`, `min-h-14`).
  - `shows only the mark below 640 px`.
  - `shortens HLS/DASH to HLS below 640 px`.
  - `trades the Sign in text for an icon below 360 px`.
  - `keeps the smaller side padding on a phone and the roomy one from 640 px up`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/components/layout/__tests__/Header.layout.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the classes.
- [ ] **Step 4: Run** `node ./node_modules/vitest/vitest.mjs run`, the full suite. Expected: PASS. For an `UNKNOWN ... aria-query` load failure, re-run first: it's a known Windows flake.
- [ ] **Step 5: Commit:** `git add -A src/components/layout`, then `git commit -m "feat(header): one row on a phone"`

---

### Task 9: Verify by hand, document, ship

**Files:**
- Modify: `CLAUDE.md` (the Key Files entry for the header, the tabs, the row, Accounts, `youtubeImport.ts`)

- [ ] **Step 1: Static checks.** Run `node ./node_modules/typescript/bin/tsc -b`, `node ./node_modules/eslint/bin/eslint.js .` and `node ./node_modules/vite/bin/vite.js build`. Expected: no errors, and `dist/` is written.
- [ ] **Step 2: By hand,** on `preview_start prism-header-dev`, on `/twitch/<live channel>` at 1280×800, 640×800, 375×812, 360×740 and a landscape phone (812×375).
  - Hovering the tabs pushes the video down without pausing it.
  - Opening Accounts and the paste box (with its list showing) doesn't pause it.
  - Following and Your Stats open and close from the row.
  - Esc and outside clicks fold the row.
  - Nothing scrolls sideways (check `document.documentElement.scrollWidth <= innerWidth`).
  - On the landscape phone the header is hidden by fill mode as before.
  - Re-import from the header shows `Importing…`, and the Catch up page picks up the result (its count changes).
  - Screenshot each width.
- [ ] **Step 3: Update `CLAUDE.md`**, then `git add CLAUDE.md` and `git commit -m "docs: header nav in CLAUDE.md key files"`.
- [ ] **Step 4: Ship.**
  - Push `feat/header-nav` and open the PR against `main`.
  - The PR body has the summary, the screenshots, the test results, and ends with the attribution line plus `Co-Authored-By`.
  - Then `get_status` / `bind_pr`.
