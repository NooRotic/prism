# Twitch Glaze Me — Design Spec

## Overview

A standalone Twitch Channel Streamer Highlighter SPA that presents Twitch users in a bold, visually striking way. Focuses on bulletproof video playback and rich channel statistics derived from the Twitch Helix API. Separate from the wsp-skills-portfolio project but reuses proven patterns from it.

**Value prop vs TwitchTracker:** TwitchTracker = spreadsheet for analysts. Glaze Me = visual showcase for fans. We can't match their historical data (they've crawled daily for years) but we beat them on presentation and real-time enrichment.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build | Vite 6 | No SSR needed — eliminates all `next/dynamic`/`"use client"` pain from v1 |
| UI | React 19 + TypeScript 5.x | Same ecosystem as portfolio, all code ports directly |
| Styling | Tailwind CSS v4 | Brand consistency |
| Video (Twitch) | Twitch Embed JS SDK (primary) | Real events (VIDEO_READY, ONLINE/OFFLINE), proper error handling |
| Video (HLS) | Video.js 8 | Proven in portfolio |
| Video (DASH) | dashjs | Proven in portfolio |
| Video (YouTube) | react-player 3.x | Native YouTube support, zero config |
| Icons | lucide-react | Lightweight |
| State | React Context + useReducer | Sufficient for SPA scope |
| Testing | Vitest + @testing-library/react | Native Vite integration |
| Deploy | GitHub Pages | Free, static |
| CI/CD | GitHub Actions | Matches portfolio workflow |

---

## Layout: Split Command Center

Desktop: Player (70% width) + Profile Sidebar (30%) top row. Full-width stats summary row below. Clips/VODs grid at bottom. Mobile: single column, player on top.

```
┌─────────────────────────────────────────────────────────────┐
│  🎮 GLAZE ME          [🔍 Search channel...]  [Login Twitch]│
├──────────────────────────────────┬──────────────────────────┤
│                                  │  👤 NooRoticX            │
│     TWITCH PLAYER (70%)          │  PARTNER                 │
│     Embed SDK → iframe → fallback│  Tags: English, Chill    │
│                            [LIVE]│  🎬 84 emotes            │
│                          [Debug] │  📺 12 badge sets        │
├──────────────────────────────────┴──────────────────────────┤
│  247 CLIPS  │  142h STREAMED  │  8 GAMES (20)  │ 38 CLIPPERS│
├─────────────────────────────┬───────────────────────────────┤
│  🔥 TOP CLIPS              │  📼 RECENT VODS               │
│  [thumb] [thumb] [thumb]    │  [thumb] [thumb] [thumb]      │
│  Click → plays in player    │  Click → plays in player      │
└─────────────────────────────┴───────────────────────────────┘
```

---

## Video Player Architecture

### Fallback Chain

```
URL → urlDetection.ts classifies type
  → twitch-stream/clip/video → TwitchEmbedPlayer (SDK)
      → onError → TwitchIframePlayer (raw iframe)
          → onError → FallbackCard (thumbnail + "Watch on Twitch")
  → youtube → ReactPlayer
  → hls → VideoJSPlayer
  → dash → DashJSPlayer
  → unknown → FallbackCard ("Unsupported format")
```

### Common Player Interface

All player components expose: `{ onReady, onError, onPlay, onPause }`

`PlayerHost` wrapper manages the fallback chain and renders a debug overlay (toggled via subtle button) showing:
- Current player engine in use
- Fallback step (1/2/3)
- Error reason if any
- URL classification result

### Twitch Embed SDK Integration

- Load `https://embed.twitch.tv/embed/v1.js` dynamically
- `new Twitch.Embed(element, { channel, parent: [window.location.hostname], ... })`
- Events: `Twitch.Embed.VIDEO_READY`, `VIDEO_PLAY`, `ONLINE`, `OFFLINE`
- `parent` parameter reads `window.location.hostname` at render time (works for both localhost and GitHub Pages)

---

## Data Enrichment — MVP Scope

### Direct from Helix API (no auth needed for any channel)

| Feature | Endpoint(s) | LOE |
|---|---|---|
| Live Stream Stats | `GET /streams` | ~15min |
| Clip Analytics (enhanced) | `GET /clips` + `GET /games` cross-ref | ~30min |
| VOD Library Stats | `GET /videos` | ~30min |
| Profile & Identity | `GET /users` + `GET /channels` | ~15min |
| Emote & Badge Census | `GET /chat/emotes` + `GET /chat/badges` | ~1hr |
| Stream Tags & Category | `GET /channels` (tags, game, broadcaster_type) | ~15min |

### Derived Client-Side (computed from API data)

| Feature | Source Data | LOE |
|---|---|---|
| Growth Indicators | Clip view velocity, VOD view trends, clip creation rate | ~45min |
| Content Diversity Index | Game IDs across last 20 VODs → unique count + percentages | ~30min |
| Clip Engagement Ratio | Clips per stream hour, unique clippers, avg views/clip | ~30min |

### Auth-Gated (viewer's own data only)

| Feature | Endpoint | Scope Needed | LOE |
|---|---|---|---|
| Taste Profile | `GET /channels/followed` | `user:read:follows` | ~1hr |

### Backlogged (Post-MVP)

- Stream Schedule (`GET /schedule`) — "Next Live" countdown
- Teams Membership (`GET /teams/channel`) — team badges on profile
- Channel Point Rewards (`GET /channel_points/custom_rewards`) — needs extra scope
- Cheermotes (`GET /bits/cheermotes`) — animated bit emotes as decorative elements
- Content Classification Labels — maturity badges
- Stream Consistency Score — derived from VOD timestamps
- Peak Hours Heatmap — 7×24 grid from VOD start times

---

## Smart URL Input

- **On focus**: dropdown with search history (max 20, localStorage) + QuickLinks (top Twitch categories from `GET /top/games`)
- **On type**: filter history, detect URL type, show color-coded inline badge:
  - Purple border/badge → Twitch
  - Red → YouTube
  - Blue → HLS/DASH
- **On submit**: classify URL, dispatch LOAD_CHANNEL or PLAY_URL, save to history
- **Autocomplete**: filter history by input value (fixed from v1 bug where full history showed regardless)

---

## Display Modes

### Streamer (isLive === true OR broadcaster_type !== "")

- Player shows live stream (or last clip if offline)
- Profile sidebar with tags, badges, emote count
- Stats row with live viewer count highlighted
- Clips/VODs grids below

### Chatter (broadcaster_type === "" AND no VODs)

- Player shows last clip from a favorite streamer (if taste profile available) or first clip they appear in
- Profile sidebar with follower info, account age, taste profile
- Emphasis on followed channels / interests visualization

### Idle (no channel loaded)

- Hero intro text explaining what Glaze Me does
- QuickLinks to top Twitch categories
- Login prompt (optional, app works without auth)

---

## State Architecture

Single `AppContext` with `useReducer`:

```typescript
interface AppState {
  auth: { token: string | null; isAuthenticated: boolean }
  search: { query: string; history: SearchEntry[] }
  channel: {
    profile: TwitchUser | null
    channelInfo: TwitchChannel | null
    stream: TwitchStream | null
    clips: TwitchClip[]
    videos: TwitchVideo[]
    emotes: TwitchEmote[]
    badges: TwitchBadge[]
    game: TwitchGame | null
    isLive: boolean
  }
  player: {
    currentUrl: string
    detection: URLDetectionResult | null
    activeEngine: 'twitch-sdk' | 'twitch-iframe' | 'videojs' | 'dashjs' | 'reactplayer' | 'fallback'
    fallbackStep: number
    debugMode: boolean
  }
  displayMode: 'idle' | 'streamer' | 'chatter'
  loading: boolean
  error: string | null
}
```

Actions: `LOGIN`, `LOGOUT`, `TOKEN_EXPIRED`, `SET_QUERY`, `LOAD_CHANNEL_START`, `LOAD_CHANNEL_SUCCESS`, `LOAD_CHANNEL_ERROR`, `PLAY_URL`, `SET_ENGINE`, `TOGGLE_DEBUG`, `SET_DISPLAY_MODE`

---

## Code Reuse from wsp-sender

### Port directly (env var changes only)

| File | From | Changes |
|---|---|---|
| `urlDetection.ts` | `wsp-sender/lib/urlDetection.ts` | None (clean) |
| `twitchApi.ts` | `wsp-sender/lib/twitchApi.ts` | `NEXT_PUBLIC_` → `VITE_`, extend with new endpoints |
| `twitchAuth.ts` | `wsp-sender/lib/twitchAuthClient.ts` | `NEXT_PUBLIC_` → `VITE_`, redirect URI to `window.location.origin` |
| Clip/Video rendering | `wsp-sender/components/MediaTwitchDashboard.tsx` | Extract into ClipCard.tsx, VideoCard.tsx |
| clipStats logic | `wsp-sender/components/MediaTwitchDashboard.tsx` L247-304 | Extract into useClipStats hook |
| parseTwitchInput | `wsp-sender/components/TwitchPlayer.tsx` | Merge into urlDetection.ts |

### Write fresh

- `PlayerHost` + `TwitchEmbedPlayer` + fallback chain
- `SmartUrlInput` + `SearchSuggestions` + `QuickLinks`
- `AppShell` (Split Command Center layout)
- `ProfileSidebar`, `StatsRow`, `ClipGrid`, `VODGrid`
- `useChannelData` hook (Promise.all fetch with error handling)
- `useTwitchAuth` hook (token lifecycle, expiry detection)
- Derived stats computations (diversity, engagement, growth)
- CI/CD workflows

### Do NOT port

- `next/dynamic` wrappers → replaced by `React.lazy` + `Suspense`
- `next/image` → replaced by `<img>` with lazy loading
- GSAP animations, Cast button, portfolio-specific components
- MediaTwitchDashboard as a monolith → decomposed into hooks + components

---

## Auth Flow

- **OAuth type**: Implicit Grant Flow (no backend needed for static export)
- **Client ID**: from `VITE_TWITCH_CLIENT_ID` env var (same Twitch Developer Console app)
- **Redirect URI**: `window.location.origin` (covers localhost:5173 + GitHub Pages)
- **Scopes**: `user:read:follows` (for taste profile)
- **Token storage**: localStorage with expiry detection
- **Expiry handling**: `assertNotUnauthed()` on API responses, clear token on 401, show re-login prompt (fixed from v1)
- **No-auth mode**: App fully functional without login — auth only unlocks taste profile

---

## CI/CD & Deployment

### GitHub Actions

- **CI** (`ci.yml`): lint + test + build on PR/push, cancel in-progress
- **Deploy** (`deploy.yml`): build + deploy to GitHub Pages on main push

### Configuration

- `vite.config.ts`: `base: '/twitch-glaze-me/'` for GitHub Pages sub-path
- GitHub repo secrets: `VITE_TWITCH_CLIENT_ID`
- Twitch Developer Console: add `https://<username>.github.io/twitch-glaze-me/` and `http://localhost:5173/` as OAuth redirect URLs

---

## Brand & Theme

- **Background**: `#0a0a0a` (near-black)
- **Primary accent**: `#39FF14` (neon green)
- **Twitch accent**: `#9146FF` (Twitch purple)
- **YouTube accent**: `#FF0000`
- **HLS/DASH accent**: `#3B82F6` (blue)
- **Warning/growth**: `#ffc832` (gold)
- **Secondary accents**: `#ff6b35` (orange), `#ff4444` (red)
- **Font**: System font stack (or Orbitron for headings to match cyberpunk/matrix theme)
- **Style**: Dark cyberpunk aesthetic consistent with NooRoticX stream brand

---

## Error Handling

- Token expiry: `SessionExpiredError` class, clear token, show re-login prompt
- API errors: broad `!res.ok` guard (not just 401 — fixed from v1)
- Embed failures: fallback chain with debug visibility
- Network errors: toast notification + retry button
- Rate limiting (429): backoff + user-visible "Twitch is rate limiting, try again in Xs"

---

## Verification Plan

| Phase | Test |
|---|---|
| Scaffold | `npm run dev` shows dark-themed page with brand colors |
| Auth | OAuth login/logout works, token persists, expiry detected |
| Player | Paste Twitch channel/clip/VOD, YouTube URL, HLS URL → correct engine renders |
| Player fallback | Block embed (DevTools) → falls back to iframe → falls back to thumbnail |
| Smart Input | Type channel, see history, see color badges, submit loads channel |
| Channel Data | Enter live streamer → streamer view. Enter non-streamer → chatter view |
| Stats | All 10 MVP stats render with correct data for a known channel |
| Layout | 3-section responsive layout, click clip → plays in center player |
| CI/CD | Push to main → deploy succeeds, site loads, OAuth works on Pages |
