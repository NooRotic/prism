# PRISM Redesign — Player Technology Showcase

> Recovered from brainstorming session 2026-04-23 (session e00b934d).
> All 6 design sections were approved by the user. Spec file was never written to disk due to session crash.

---

## Framing

**PRISM is the player. The website is its harness.** Every page exists to showcase a playback capability.

The current landing page is a hero-centric "paste a URL" experience. This redesign shifts PRISM to a **player technology showcase** with:
- A hub landing page with a dashboard grid of demo content
- Dedicated sub-pages per protocol (Twitch, YouTube, HLS/DASH)
- Pre-seeded demo content that works without login
- Auth unlocks personalized Twitch content (Following, Stats, Favorites)
- Matrix rain background as the signature visual element

---

## Section 1: Positioning & Information Architecture

### Route Structure

```
/                    → Hub (dashboard grid, SmartUrlInput, player viewport)
/twitch              → Twitch protocol page (sidebar + demo channels)
/twitch/:channel     → Playing a Twitch channel (existing streamer view)
/youtube             → YouTube protocol page (sidebar + demo videos)
/youtube/:videoId    → Playing a YouTube video
/hls-dash            → HLS/DASH protocol page (sidebar + test streams)
/hls-dash/:streamId  → Playing a specific stream
```

### Shared Layout

- **Hub (`/`)** uses compact header + grid layout (no sidebar)
- **Protocol pages** (`/twitch`, `/youtube`, `/hls-dash`) use sidebar layout with collapsible nav
- **Playing pages** (`/twitch/:channel`) inherit sidebar layout but show full player + enrichment (clips, VODs, stats for Twitch; just player for others)

### Navigation (preserved from current app)

- Following panel → sidebar link, purple, locked when unauth'd
- Your Stats panel → sidebar link, purple, locked when unauth'd
- Categories panel → sidebar link, always available
- SmartUrlInput → in header on hub, in sidebar on protocol pages

### Auth Gating

- **Unauth'd:** full demo experience — public Twitch channels, YouTube, HLS/DASH all work. Following/Stats show purple lock icon. "Your Favorites" card locked.
- **Auth'd:** Following/Stats unlock, "Your Favorites" shows followed channels, Twitch section enriched with personalized content.

---

## Section 2: Demo Content Configuration

All demo content lives in a single editable config file.

```typescript
// src/config/demoContent.ts

interface DemoEntry {
  id: string
  label: string
  description?: string
  protocol: 'twitch' | 'youtube' | 'hls' | 'dash' | 'mp4'
  url: string           // full URL or channel name for Twitch
  thumbnail?: string    // optional static thumbnail
  featured?: boolean    // show larger on hub grid
}

const DEMO_CONTENT: DemoEntry[] = [
  // Twitch — public channels (no auth needed for profile/live status)
  { id: 'hasanabi',   label: 'hasanabi',   protocol: 'twitch', url: 'hasanabi',   featured: true },
  { id: 'carter',     label: 'carter',     protocol: 'twitch', url: 'carter' },
  { id: 'audrareins', label: 'AudraReins', protocol: 'twitch', url: 'AudraReins' },
  { id: 'xqc',        label: 'xQc',        protocol: 'twitch', url: 'xqc' },
  { id: 'kaicenat',   label: 'Kai Cenat',  protocol: 'twitch', url: 'kaicenat' },
  { id: 'shroud',     label: 'shroud',     protocol: 'twitch', url: 'shroud' },

  // YouTube — hardcoded video IDs
  { id: 'yt-1', label: 'Video 1', protocol: 'youtube', url: 'https://youtu.be/RBuinr1g8h4', featured: true },
  { id: 'yt-2', label: 'Video 2', protocol: 'youtube', url: 'https://www.youtube.com/watch?v=9JykA28EoTg' },
  { id: 'yt-3', label: 'Video 3', protocol: 'youtube', url: 'https://www.youtube.com/watch?v=fQGbXmkSArs' },

  // HLS — public test streams
  { id: 'apple-basic', label: 'Apple HLS Basic', protocol: 'hls', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8' },
  { id: 'apple-4k',    label: 'Apple 4K HEVC',   protocol: 'hls', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8', featured: true },
  { id: 'bbb-hls',     label: 'Big Buck Bunny',   protocol: 'hls', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },

  // DASH — public test manifests
  { id: 'dash-bbb',     label: 'Big Buck Bunny',  protocol: 'dash', url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', featured: true },
  { id: 'dash-envivio', label: 'Envivio DASH',    protocol: 'dash', url: 'https://dash.akamaized.net/envivio/EnvisioTVDVBTest/manifest.mpd' },
]
```

**Key points:**
- `featured: true` entries render larger on hub grid (asymmetric layout, Law 3)
- Twitch entries use channel names — `useChannelData` fetches live status/profile at runtime
- HLS/DASH URLs are industry-standard test streams, always available
- Adding a new entry = one line in the array

---

## Section 3: Background System

**Matrix rain canvas** as the "one memorable thing" (Law 9).

### Implementation

- Extend existing `ShaderBackground.tsx` with a matrix rain fragment shader — falling green characters at ~10% opacity on the `#0a0a0a` base
- Characters use PRISM's accent green (`#39FF14`) with slow downward drift
- Speed, density, opacity all configurable via props for per-page tuning
- `prefers-reduced-motion` respected — falls back to a static subtle grid pattern
- Renders behind all content via `position: fixed; z-index: 0`

### Fallback

If WebGL isn't available or shader debugging takes too long, swap in `RainCode_sm.mp4` (1.4MB) from the portfolio as a looping `<video>` element at 10% opacity. Copy to `public/bgs/`.

### Per-page Tuning

| Route | Density | Speed | Notes |
|-------|---------|-------|-------|
| Hub (`/`) | Lower | Slower | Ambient, not distracting from the grid |
| Protocol pages | Slightly higher | Normal | Fills negative space behind sidebar |
| Playing content | Lowest / disabled | — | Player is the focus |

---

## Section 4: Component Architecture & Layout

### New Components

| Component | Purpose |
|-----------|---------|
| `HubPage` | Landing at `/` — compact header, SmartUrlInput, player viewport, protocol card grid, locked Favorites |
| `ProtocolPage` | Shared layout for `/twitch`, `/youtube`, `/hls-dash` — collapsible sidebar + content area |
| `ProtocolSidebar` | Collapsible left nav — protocol links, Following/Stats (purple/locked), Categories, SmartUrlInput, Connect Twitch |
| `DemoGrid` | Renders `DemoEntry[]` filtered by protocol — cards with thumbnails/brand icons, click to play |
| `MatrixRainBackground` | Extended shader or canvas — fixed behind all content |
| `ProtectedNavLink` | Purple lock icon + label for auth-gated nav items (Following, Stats) |
| `FavoritesCard` | Locked card on hub showing "Connect Twitch to unlock", unlocks to show followed channels |

### Modified Components

| Component | Change |
|-----------|--------|
| `App.tsx` | Wrap in `BrowserRouter`, define route tree, remove `displayMode` switch |
| `AppShell` | Becomes layout wrapper with `<Outlet />` instead of mode switching |
| `AppContext` | Remove `displayMode`, `navPanel` state. Keep `auth`, `search`, `channel`, `player` |
| `Header` | Simplified — PRISM logo (links to `/`), SmartUrlInput (hub only), Login/Logout |
| `SmartUrlInput` | On submit, navigates to correct protocol route instead of dispatching `PLAY_URL` |

### Unchanged Components

- All player components (`TwitchEmbedPlayer`, `VideoJSPlayer`, `DashJSPlayer`, `YouTubePlayer`, `PlayerHost`)
- `ProfileSidebar`, `ClipGrid`, `VODGrid`, `StatsRow` — used within `/twitch/:channel`
- `useChannelData`, `useTwitchAuth`, `useClipStats`, `useDerivedStats`

### Route Tree

```tsx
<BrowserRouter>
  <MatrixRainBackground />
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HubPage />} />
      <Route path="twitch" element={<ProtocolPage protocol="twitch" />} />
      <Route path="twitch/:channel" element={<TwitchPlayerPage />} />
      <Route path="youtube" element={<ProtocolPage protocol="youtube" />} />
      <Route path="youtube/:videoId" element={<YoutubePlayerPage />} />
      <Route path="hls-dash" element={<ProtocolPage protocol="hls-dash" />} />
      <Route path="hls-dash/:streamId" element={<HlsDashPlayerPage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

### Sidebar Behavior

- Collapsed by default on mobile, expanded on desktop
- Toggle button (chevron) to collapse/expand
- Protocol links highlight active route
- Following/Stats links: purple text + lock icon when unauth'd, clickable when auth'd

---

## Section 5: Data Flow & State Changes

### What Stays in AppContext

- `auth` — token, user, isAuthenticated (global, needed everywhere)
- `search` — query, history (global, persists across routes)
- `channel` — profile, stream, clips, videos, emotes, badges (loaded when viewing a Twitch channel)
- `player` — activeEngine, fallbackStep, debugMode (player internals)

### What Gets Removed from AppContext

- `displayMode` — replaced by the current route
- `navPanel.open` — sidebar state is local to `ProtocolSidebar`
- `currentUrl` / `detection` — derived from route params instead

### Data Flow: Playing Content

```
User clicks demo card on /twitch
  → navigate('/twitch/hasanabi')
  → TwitchPlayerPage reads useParams().channel
  → useChannelData(channel) fetches from Helix API
  → PlayerHost renders with detection from urlDetection(channel)
  → Existing fallback chain works unchanged
```

```
User pastes URL in SmartUrlInput
  → urlDetection(url) classifies it
  → navigate to correct route:
      twitch stream → /twitch/{channel}
      youtube       → /youtube/{videoId}
      hls/dash      → /hls-dash/{encodedUrl}
  → Target page reads params, renders PlayerHost
```

### HLS/DASH URL Handling

`:streamId` param maps to a key in `DEMO_CONTENT` for demo entries (clean paths like `/hls-dash/apple-4k`). Arbitrary pasted URLs use a query param: `/hls-dash?url=encoded-url`.

### Deep Linking Migration

- **Old:** `?channel=ninja&player=clip&clipId=abc` → dispatches to AppContext
- **New:** `/twitch/ninja` with clip params as query: `/twitch/ninja?clip=abc`
- `useDeepLinkRead` / `useDeepLinkWrite` are retired — React Router `useParams` / `useSearchParams` replace them

---

## Section 6: Visual Design Compliance (DESIGN-LAWS Audit)

| Law | Status | Implementation |
|-----|--------|----------------|
| **L1: No default fonts** | Orbitron (display) + JetBrains Mono (code/labels) — carry forward |
| **L2: Ban purple gradients** | Purple ONLY for Twitch brand (`#9146FF`). Red = YouTube, Blue = HLS/DASH, Green = PRISM accent |
| **L3: Break the 3-column grid** | Twitch card 1.2fr, YouTube and HLS/DASH 1fr each. Featured entries render larger. Hub player viewport breaks grid above cards |
| **L4: Vary border radius** | 3 tiers: `2px` (inputs, badges), `4px` (buttons, cards), `6px` (player viewport, major containers). Sidebar nav: `0px` left, `3px` right |
| **L5: Shadows mean something** | L1 resting: subtle 1px border glow. L2 hover: colored border brightens (protocol color). L3 floating: faint green glow on active player. No decorative box-shadows |
| **L6: No glassmorphism** | Solid `#0d0d0d` cards on `#0a0a0a` base. Matrix rain behind solid surfaces. No blur, no translucency |
| **L7: Motion communicates** | Matrix rain = ambient. Card hover = interactivity signal. Sidebar collapse = spatial change. No scroll-triggered fade-ins. `prefers-reduced-motion` respected |
| **L8: Semantic color** | `--accent-prism` (#39FF14), `--accent-twitch` (#9146FF), `--accent-youtube` (#FF0000), `--accent-hls` (#3B82F6). Lock states: 55% opacity = locked, 100% = unlocked |
| **L9: One memorable thing** | The matrix rain background. Slow-falling green characters on near-black. Unique to PRISM |
| **L10: Design from the subject** | Player technology showcase — design derives from broadcast monitoring, terminal aesthetics, streaming culture |

**Score: 20/20**

---

## Decisions Log

| Question | Decision | Rationale |
|----------|----------|-----------|
| Landing experience | Hub + dashboard grid (A+C mix) | Showcase + real app feel |
| Demo content (unauth'd) | Public Twitch channels + HLS/DASH + YouTube (option B) | Full demo without login |
| Navigation/routing | Separate routes per protocol (option C) | Room for rich per-protocol experience |
| Router | React Router (option A) | Nested routes, `<Outlet>`, `useParams` |
| Background | Canvas-first, MP4 fallback (A with B fallback) | Lightweight, customizable, no asset hosting |
| Migration approach | Clean break (Approach 1) | Route IS display mode, retire `displayMode` |
| Twitch channels | hasanabi, carter, AudraReins, xQc, Kai Cenat, Shroud | Mix of categories, reliably active |
