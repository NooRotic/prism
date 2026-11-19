# Video pop-out for YouTube and HLS / DASH — design

Date: 2026-11-19. Status: approved by the owner in chat 2026-11-19 (the owner's one answer: "pop-out opens a small window, same as video pop out in twitch player page").

## Intent

The owner uses PRISM more and wants the Twitch page's "Pop out video" button on the YouTube player page and the HLS / DASH page. A click opens the same small, always-on-top window, so a video keeps playing while they browse PRISM or other tabs.

## Goals

- A pop-out button on `/youtube/:videoId` and `/hls-dash/:streamId?`, the same `VideoPopoutButton`, same labels, same notices ("couldn't open", "couldn't start").
- The window follows the page: moving to another YouTube video (the filmstrip's Previous / Next, a related video) or another stream switches what the window plays, as the Twitch window follows channels.
- While the window is open, the in-page player is replaced by the existing "The video is in a floating window / Bring video back" panel, so nothing plays twice and nothing is drawn over an embed.
- YouTube starts at the page's current position when it can be read, otherwise at 0.

## Non-goals

- No button on the Catch up page, the browse lists or the Twitch page's own behaviour (unchanged).
- No support for browsers without Document Picture-in-Picture (Chrome / Edge 116+ only, as today); the button stays hidden there, on phones included.
- Live HLS / DASH streams do not "resume at a position"; they join live.

## Anti-goals

- Two players playing at once.
- A window that silently shows a blank player: a source that cannot start closes the window and says so (the existing `failed` notice).
- Touching the Twitch window's behaviour or its tests.

## Approaches

1. **Move the page's own player into the window.** Rejected: an iframe reloads when it is reparented (YouTube would restart anyway), and React owns that DOM.
2. **Build each engine by hand inside the window**, as the Twitch embed is. Rejected: it re-implements video.js, dash.js and react-player wiring in a document that is not the app's, with cross-document hazards.
3. **The window loads a bare app route (`/popout/player`) in an iframe and that route renders the real `PlayerHost`.** Chosen (my call, refining the approved design): the engines run in their own same-origin document exactly as on the pages, the volume memory and playback log work unchanged, and one mechanism serves YouTube and HLS / DASH. The chat pop-out already sets the precedent of a route outside the layout.

## Design

- **Source** (`src/lib/floatingVideo.ts`): `FloatingSource = { kind: 'twitch'; channel } | { kind: 'youtube'; videoId; startSec? } | { kind: 'stream'; url; streamKind }`. `floatingSourceFromPath(pathname, search, detection)` returns the page's source or null. `canPopOutOn` and `floatingShouldEnd` follow it: the YouTube and HLS routes now offer the button instead of ending the window; a Twitch clip / VOD still ends it.
- **Window** (`src/lib/floatingWindow.ts`): `openFloatingWindow` takes a `source`. Twitch keeps the SDK path. YouTube and streams show the same "Click here to start with sound" screen, then create an `<iframe src="/popout/player?...">` (`allow="autoplay; fullscreen"`) in the window. `setSource` on the session changes the iframe address (a Twitch-to-Twitch change still uses `setChannel`). The ready timer, resize saving and the resume-on-grow rule are shared.
- **Route** (`src/pages/PopoutPlayerPage.tsx`, `/popout/player`, outside the layout): reads `?kind=youtube&v=<id>&t=<sec>` or `?kind=stream&url=<addr>&as=<hls|dash|...>`, validates them (an 11-character video id; an http(s) address), and renders `PlayerHost` full-bleed on black. A bad query shows nothing and reports failure to the opener.
- **Provider** (`FloatingVideoProvider`): derives the source from the route, opens with it, and calls `setSource` when the page's source changes. `FloatingVideoControls` is unchanged for callers (`canOpen`, `isFloating`, `open`, `close`).
- **Pages**: `YoutubePlayerPage` and `HlsPage` show the button near the player and render `FloatingPanel` in place of the player while `isFloating`. The page's current time for YouTube comes from the player when readable.

## Constraints

- The browser only opens the window inside a click: `open` stays synchronous.
- Twitch's 480×270 floor stays; the saved size is shared by all three kinds.
- TypeScript `erasableSyntaxOnly`; no Co-Authored-By in commit messages.

## Left to the builder

- Exact placement and styling of the button on the two pages.
- How the YouTube page reads the current time (best effort; 0 is acceptable).
- The route's failure signal to the opener (a `postMessage` or the iframe's ready timer), whichever is simplest.
