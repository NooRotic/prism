# PRISM Redesign — Implementation Plan

> Based on design spec: `docs/superpowers/specs/2026-04-23-prism-redesign-design.md`
> Current state: `main` at `6fd8667`, 173 tests passing, no react-router installed

---

## Phase 1: Foundation (Router + State Migration)

### 1.1 Install React Router
- `pnpm add react-router-dom`
- No types package needed (included in v7+)

### 1.2 Create Demo Content Config
- Create `src/config/demoContent.ts` with `DemoEntry` interface and `DEMO_CONTENT` array
- Export helper: `getDemoByProtocol(protocol)`, `getDemoById(id)`

### 1.3 Migrate App.tsx to React Router
- Wrap app in `BrowserRouter`
- Define route tree per spec (Section 4)
- `AppShell` becomes `<Outlet />` layout wrapper
- Keep `AppContext` provider inside router

### 1.4 Simplify AppContext
- Remove `displayMode` from state (route IS the display mode)
- Remove `navPanel.open` from global state (becomes local to sidebar)
- Keep `PLAY_URL` action but make it navigate instead of setting state
- Add `GO_HOME` → navigate to `/`

### 1.5 Retire Deep Link System
- Remove `useDeepLinkRead` / `useDeepLinkWrite`
- Route params + `useSearchParams` replace them entirely

**Tests:** Existing 173 tests should still compile. Some may need mocking of `BrowserRouter`. Run full suite after each sub-step.

---

## Phase 2: Hub Page + Protocol Pages

### 2.1 Create HubPage Component
- Route: `/` (index)
- Compact header with SmartUrlInput
- Player viewport area (empty state or featured content auto-playing)
- Protocol card grid: Twitch (1.2fr), YouTube (1fr), HLS/DASH (1fr)
- Each card links to `/twitch`, `/youtube`, `/hls-dash`
- Locked "Your Favorites" card (purple, auth-gated)
- Featured demo entries rendered larger (Law 3: asymmetric grid)

### 2.2 Create ProtocolPage Component
- Shared layout for `/twitch`, `/youtube`, `/hls-dash`
- Accepts `protocol` prop to filter `DEMO_CONTENT`
- Renders `ProtocolSidebar` + `DemoGrid`

### 2.3 Create ProtocolSidebar Component
- Collapsible left nav
- Protocol links (highlight active route)
- `ProtectedNavLink` for Following/Stats (purple + lock icon when unauth'd)
- Categories link (always available)
- SmartUrlInput (in sidebar, not header, on protocol pages)
- "Connect Twitch" CTA when unauth'd

### 2.4 Create DemoGrid Component
- Renders `DemoEntry[]` filtered by protocol
- Cards with brand-colored borders (Twitch purple, YouTube red, HLS/DASH blue)
- Click → navigate to `/:protocol/:id`
- Thumbnails fetched at runtime for Twitch (profile pics via API)
- Featured entries span wider (asymmetric layout)

### 2.5 Create FavoritesCard Component
- Locked state: "Connect Twitch to unlock" + lock icon + purple accent
- Unlocked state: shows followed channels from `useFollowedChannels`

### 2.6 Modify Header
- PRISM logo → links to `/` via `<Link>`
- SmartUrlInput only on hub (`/`), hidden on protocol pages (it's in sidebar)
- Login/Logout button always visible

### 2.7 Modify SmartUrlInput
- On submit: instead of `dispatch(PLAY_URL)`, use `navigate()` to correct route
- `urlDetection(url)` → route mapping:
  - twitch → `/twitch/{channel}`
  - youtube → `/youtube/{videoId}`
  - hls/dash → `/hls-dash/{streamId}` or `/hls-dash?url=encoded`

---

## Phase 3: Player Pages (per-protocol)

### 3.1 Create TwitchPlayerPage
- Route: `/twitch/:channel`
- Reads `useParams().channel`
- Calls `useChannelData(channel)` (existing hook)
- Renders `PlayerHost` + existing `ProfileSidebar`, `StatsRow`, `ClipGrid`, `VODGrid`
- Essentially the current "streamer" view, but route-driven

### 3.2 Create YoutubePlayerPage
- Route: `/youtube/:videoId`
- Reads `useParams().videoId`
- Constructs YouTube URL → passes to `PlayerHost`
- Minimal layout: player + title/description

### 3.3 Create HlsDashPlayerPage
- Route: `/hls-dash/:streamId`
- If `:streamId` matches a `DEMO_CONTENT` entry → use that URL
- If query param `?url=` exists → decode and use that
- Renders `PlayerHost` with detected HLS or DASH type

### 3.4 Wire Existing Panels into Sidebar
- Following panel content → renders inside `ProtocolSidebar` when expanded (instead of slide-down)
- Your Stats panel content → same treatment
- Category panel → same treatment
- Remove slide-down positioning; content now flows in sidebar

---

## Phase 4: Matrix Rain Background

### 4.1 Extend ShaderBackground
- Add matrix rain mode alongside existing noise shader
- Falling green characters (`#39FF14`) at configurable opacity
- Props: `mode: 'noise' | 'matrix-rain'`, `density`, `speed`, `opacity`

### 4.2 Per-page Tuning
- Hub: lower density, slower speed
- Protocol pages: slightly higher density
- Player pages: lowest opacity or disabled
- `prefers-reduced-motion`: static subtle grid pattern

### 4.3 MP4 Fallback
- Copy `RainCode_sm.mp4` to `public/bgs/`
- If WebGL unavailable → `<video>` loop at 10% opacity

---

## Phase 5: Polish + Tests

### 5.1 Update Existing Tests
- Mock `BrowserRouter` in test setup
- Update tests that reference `displayMode`
- Add route-based rendering tests for new pages

### 5.2 New Tests
- `DemoGrid` renders correct entries per protocol
- `HubPage` renders protocol cards with correct links
- `ProtocolSidebar` shows lock icons when unauth'd
- `SmartUrlInput` navigates to correct routes
- Route params → player rendering (integration tests)

### 5.3 GitHub Pages SPA Fix
- Add `public/404.html` that redirects to `index.html` with path preserved
- Or use hash router fallback if needed (GitHub Pages doesn't support client-side routing natively)

### 5.4 Responsive Breakpoints
- Mobile: sidebar collapsed by default, single-column grid
- Desktop: sidebar expanded, multi-column grid
- Hub: grid collapses to stacked cards on mobile

---

## Build Sequence (recommended PR order)

| PR | Content | Risk |
|----|---------|------|
| 1 | React Router + demo content config + state migration | High (foundational) |
| 2 | HubPage + protocol card grid | Medium |
| 3 | ProtocolPage + ProtocolSidebar + DemoGrid | Medium |
| 4 | TwitchPlayerPage (port existing streamer view) | Low |
| 5 | YoutubePlayerPage + HlsDashPlayerPage | Low |
| 6 | SmartUrlInput route navigation | Medium |
| 7 | Matrix rain background | Low |
| 8 | Panel migration (Following/Stats → sidebar) | Medium |
| 9 | Polish, responsive, tests, 404 fix | Low |

---

## Files Created (new)

```
src/config/demoContent.ts
src/pages/HubPage.tsx
src/pages/TwitchPlayerPage.tsx
src/pages/YoutubePlayerPage.tsx
src/pages/HlsDashPlayerPage.tsx
src/pages/ProtocolPage.tsx
src/components/layout/ProtocolSidebar.tsx
src/components/layout/ProtectedNavLink.tsx
src/components/grid/DemoGrid.tsx
src/components/grid/DemoCard.tsx
src/components/grid/FavoritesCard.tsx
src/components/grid/ProtocolCard.tsx
public/404.html
```

## Files Modified (existing)

```
src/App.tsx                    — BrowserRouter + route tree
src/components/layout/AppShell.tsx  — Outlet layout
src/components/layout/Header.tsx    — simplified, conditional SmartUrlInput
src/components/search/SmartUrlInput.tsx — navigate() instead of PLAY_URL
src/contexts/AppContext.tsx         — remove displayMode, navPanel
package.json                        — add react-router-dom
```

## Files Removed

```
src/hooks/useDeepLinkRead.ts   — replaced by route params
src/hooks/useDeepLinkWrite.ts  — replaced by route params
```
