# PRISM — Player Routing & Insight for Streaming Media

## Architecture
- **Stack**: Vite 6 + React 19 + TypeScript + Tailwind CSS v4
- **State**: React Context + useReducer (AppContext.tsx)
- **Video**: Twitch Embed JS SDK (primary), Video.js (HLS), dashjs (DASH), react-player (YouTube)
- **Deploy**: Static export to GitHub Pages

## Conventions
- Use `var(--accent-green)` (#39FF14) for primary accent, `var(--accent-twitch)` (#9146FF) for Twitch
- Player components expose `{ onReady, onError, onPlay, onPause, onOffline, onOnline, onEnded, onPlaybackBlocked }` interface (all optional)
- All Twitch API calls go through `lib/twitchApi.ts`
- Auth state managed by `useTwitchAuth` hook
- Env vars prefixed with `VITE_` (not NEXT_PUBLIC_)

## Key Files
- `src/lib/urlDetection.ts` - URL classification engine
- `src/lib/twitchApi.ts` - Twitch Helix API client
- `src/lib/twitchAuth.ts` - OAuth Implicit Grant Flow
- `src/contexts/AppContext.tsx` - Global state
- `src/components/player/PlayerHost.tsx` - Video player with fallback chain
- `src/lib/historyApi.ts` - history server client (visit + read); never throws, the server is optional
- `src/hooks/useChannelHistory.ts` - a channel's history; also reports the visit that starts tracking it
- `server/` - the PHP history service (runs at prism-data.nooroticx.tv, separate from this app); see `server/README.md` and `docs/superpowers/specs/2026-11-12-history-server-design.md`
- `src/pages/AdminPage.tsx` - the owner's `/admin` pages (own lazy chunk, outside the layout); `src/components/admin/` holds the shell and screens; spec `docs/superpowers/specs/2026-11-13-playlist-admin-design.md`
- `src/lib/adminAuth.ts` - the separate permission-less admin sign-in (its token is in sessionStorage, never the viewer token); `src/lib/adminApi.ts` - typed client for `/api/admin/*`, never throws
- `src/lib/usageApi.ts` + `src/hooks/usePageHit.ts` - the page-open counter (`POST /api/hit`, production builds only, `/admin` never counted)
- `src/pages/HlsPage.tsx` - the HLS / DASH page (`/hls-dash` and `/hls-dash/:streamId`): player, "About this stream" panel and a searchable windowed list; with the server down it shows the built-in demo streams. Parts in `src/components/streams/`, `src/hooks/useStreamSnapshot.ts`, `src/hooks/useAutoFold.ts`
- `src/lib/streamsApi.ts` - client for `GET /api/streams` (the visitor stream list); never throws, remembers a good answer for the page session
- `src/components/admin/PlaylistScreen.tsx` + `server/src/Admin/PlaylistAdmin.php` - the owner's Playlist screen (`/admin/playlist`) and its API (`/api/admin/streams*`): list, add, edit, pin, default, remove; every write audited
- `server/src/Playlist/` + `server/src/Store/StreamStore.php` - the playlist store (`streams` table), the insert-only M3U importer (`server/bin/import-playlist.php`), the visitor snapshot and the logo fetcher (`server/bin/fetch-logos.php`, through the guarded fetcher in `server/src/Net/`); see `server/README.md` ("The playlist") and the spec's "Piece 2 as built"

## Design Spec
Full spec at `docs/superpowers/specs/2026-04-06-prism-design.md`

## Windows
- Use forward slashes in paths
- Use bash shell syntax
