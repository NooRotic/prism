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
- `src/lib/favorites.ts` + `src/lib/favoritesApi.ts` + `src/hooks/useFavorites.ts` - stars on the HLS / DASH page: the viewer's own set lives in localStorage (`prism_favorite_streams`); the server only gets anonymous +1 / -1 (`POST /api/favorite`) and serves the totals (`GET /api/favorites`); `StreamCard` has the star button and total, `FavoritesFilter.tsx` the "only my favorites" view, the owner sees a Stars column in `/admin/playlist` (`server/src/Store/FavoriteStore.php`, `server/src/Usage/FavoriteRecorder.php`)
- `src/pages/HlsPage.tsx` - the HLS / DASH page (`/hls-dash` and `/hls-dash/:streamId`): player, "About this stream" panel and a searchable windowed list; with the server down it shows the built-in demo streams. Parts in `src/components/streams/`, `src/hooks/useStreamSnapshot.ts`, `src/hooks/useAutoFold.ts`
- `src/lib/streamsApi.ts` - client for `GET /api/streams` (the visitor stream list); never throws, remembers a good answer for the page session
- `src/components/admin/PlaylistScreen.tsx` + `server/src/Admin/PlaylistAdmin.php` - the owner's Playlist screen (`/admin/playlist`) and its API (`/api/admin/streams*`): list, add, edit, pin, default, remove; every write audited; `StreamPreview.tsx` plays a stream in place under its row
- `src/lib/playbackLog.ts` + `src/components/streams/PlaybackDebug.tsx` - the in-page playback log the engines write to and the PLAYBACK button / console output / debug report in the About panel; `src/lib/renditionGuard.ts` - Video.js decode-failure recovery (avoid a video format, reload); `src/lib/playbackEnvironment.ts` - the browser's codec table
- `server/src/Playlist/` + `server/src/Store/StreamStore.php` - the playlist store (`streams` table), the insert-only M3U importer (`server/bin/import-playlist.php`), the visitor snapshot and the logo fetcher (`server/bin/fetch-logos.php`, through the guarded fetcher in `server/src/Net/`); see `server/README.md` ("The playlist") and the spec's "Piece 2 as built"
- `server/src/Checker/` + `server/bin/check-streams.php`, `check-worker.php`, `rejudge-held.php` - the stream checker (piece 3a): the check (`StreamChecker`, always through the guarded fetcher with `FetchPolicy::checker()`), the pure `StateMachine`, the workers, the host and run guards, and Apply through `server/src/Admin/CheckerAdmin.php`; a shadow run changes nothing visitors see until the owner applies it; see `server/README.md` ("The stream checker"), `docs/superpowers/specs/2026-11-14-playlist-checker-design.md` and the spec's "Piece 3a as built"
- `src/components/admin/HealthScreen.tsx` - the owner's Health screen (`/admin/health`): the first pass's progress, what Apply would hide, host clusters, the budget and the Apply button; `src/lib/adminApi.ts` has `getChecker`, `applyChecker`, `setCheckerPaused`
- `public/stream-checker/index.html` - the checker's public page (static, a plain HTTP 200): what it requests and how to ask for a stream's removal; its user agent (`Config::checkerUserAgent()`) links to it

- `src/components/chat/landscapePhone.ts` + `useLandscapePhone.ts` - the one definition of "a phone held sideways" (a height-based media query, so a desktop window resized short counts too); `LandscapeChatHandle.tsx` + `landscapeSwipe.ts` - the handle column that slides the chat in and out beside the video; `ChatDock` forces fill mode and pushes the video aside (never overlays it; the open chat leaves the video at least 400px, Twitch's embed minimum) while it matches; `index.css` hides the rail (`landscape-phone-hide`, and `narrow-hide` below the md breakpoint) and zeroes its gutter; `landscapeChat.ts` (the shared chat-column classes and handle label) and `useFillScope.ts` (the `data-fill` root attribute) are used by both `ChatDock` and `OfflineLayout`, which restyles itself in place (so the player never remounts) while a recording plays on a landscape phone; the Twitch video box is never shorter than 300px (its embed's minimum); specs `docs/superpowers/specs/2026-11-16-landscape-phone-layout-design.md` and `2026-11-16-portrait-and-offline-landscape-design.md`
- `src/pages/YoutubeCatchupPage.tsx` (`/youtube/catchup`) + `src/hooks/useCatchup.ts` - the YouTube "Catch up" queue: new subscription uploads (S), pasted Watch Later (W) and related-via-Mix (R), blended 2 : 1 : 1; browser-only, all state in localStorage (`prism_catchup_*`). `src/lib/catchup.ts` (pure: blend, id parsing), `catchupStore.ts`, `catchupApi.ts` (Data API; the S lane is cached 30 min), `googleYoutubeAuth.ts` (one-time read-only Google token via Identity Services, used once to import subscriptions and never stored; needs `VITE_YOUTUBE_CLIENT_ID`), `mixRelated.ts` (hidden muted IFrame player that cues `RD<videoId>` and reads `getPlaylist()`; cue, not load, so it never writes History); Watch Later cannot be read by the API, so it is pasted in; spec `docs/superpowers/specs/2026-11-18-youtube-catchup-design.md`. The import itself is `src/lib/youtubeImport.ts` (shared with the header's Accounts row: one import at a time, a revision that bumps after each one, other tabs counted through `storage` events); `src/hooks/useYoutubeAccount.ts` reads what it brought in without loading Catch up
- `src/components/layout/Header.tsx` - the header: section tabs (`SectionTabs.tsx`, rules in `src/lib/headerSections.ts`) on every page, a second row that folds away (`FoldingRow.tsx`; the open row is a reducer in `src/lib/headerRow.ts` driven by `src/hooks/useHeaderRow.ts`: hover previews, a click pins, Esc / outside / page change folds) holding Twitch's tools (`TwitchTools.tsx`: Following, Your Stats, Browse) or YouTube's (Catch up) or Accounts (`AccountsPill.tsx` + `AccountsRow.tsx`: Twitch sign-in, the YouTube import and a link to the viewer's youtube.com history; never a YouTube sign-out), and the paste box behind a link icon (`PasteToggle.tsx`; `SmartUrlInput`'s `listContainer` / `active` / `onDone` props). Nothing it opens covers the page: the row and the paste box's list are in the header's flow, so the header grows and `--header-height` pushes the page down (Twitch pauses a covered player). One row on a phone (fits 360 px; below 440 px a person icon stands in for "Sign in"); the debug gear moves into the Accounts row below 640 px. Spec `docs/superpowers/specs/2026-11-18-header-nav-refactor-design.md`
- `extension/` - the PRISM helper Chrome extension (load unpacked; steps in `extension/README.md`): reads Twitch's recommended channels and the YouTube Watch Later list from pages the owner is signed in to and opens PRISM's `/import#v=1&kind=...` with them in the address fragment (never sent to a server). `extension/handoff.js` builds the address (a classic script, also run by tests); `src/lib/extensionImport.ts` is PRISM's strict parser, `src/pages/ImportPage.tsx` asks before saving (anyone can craft that link), `src/lib/recommendedStore.ts` + `src/components/channel/RecommendedRow.tsx` are the "Recommended by Twitch" row on `/twitch`; Watch Later goes into the Catch up store; spec `docs/superpowers/specs/2026-11-18-prism-extension-design.md`

## Design Spec
Full spec at `docs/superpowers/specs/2026-04-06-prism-design.md`

## Windows
- Use forward slashes in paths
- Use bash shell syntax
