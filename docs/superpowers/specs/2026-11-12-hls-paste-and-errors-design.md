# HLS page: paste-to-play and honest errors — design

Date: 2026-11-12. Status: draft for owner approval. Size: a small-to-medium change, one PR. Branch `feat/hls-paste-and-errors`.
Source: the HLS page review (options A and B of A-E), run in the browser against real streams on 2026-11-12. The owner picked
"A + B in one PR". Options C (stream info and quality picker), D (copy link, recents) and E (demo row below the player) are NOT part of this.

## Intent and why

A person who pastes an `.m3u8` link into PRISM expects it to play. Today it does not: both paste boxes send them to
`/hls-dash?url=<url>`, which is the demo **listing** page and ignores `?url`. Only the player route `/hls-dash/:streamId` reads `?url`,
so the feature has been unreachable from the UI since the router commit (83f94df). Two neighbours of the same bug:

- A link without `.m3u8` / `.mpd` / `.mp4` in it (`…/playlist`, `…/index?token=…`) does nothing: no badge, no navigation, no error.
- When a stream cannot play, the page says "Source not supported or autoplay denied" (Video.js code 4 covers CORS, 404 and a non-HLS file alike),
  offers no Retry, and a stream that never loads sits on a spinner forever (the 10 s timer is cleared on Video.js `ready`, which fires right after init).
  An unknown stream id shows "Loading stream..." forever.

Goal in one line: **paste a stream and it plays, or the page tells you why it can't.**

## Goals

1. Pasting an HLS or DASH link in either paste box (hub, header, sidebar) opens its player page and plays.
2. A pasted address that looks like a URL but is not recognised (and is not Twitch or YouTube) opens the same player page, is tried as HLS,
   and offers "Try as: HLS · DASH · MP4".
3. Old links `/hls-dash?url=…` still work (they redirect to the player page).
4. Failures name what happened and what to do next, with a Retry; a stream that is slow to start says so without being torn down;
   an unknown stream id says "not found" and links to the demo list.

## Non-goals

Quality picker or stream-info panel (C), copy link and recent streams (D), demos row below the player (E), a CORS proxy, DASH-specific features,
pop-out or PiP for HLS, the mobile header overflow (backlog 15), any YouTube or Twitch behaviour, any change to the history server.

## Anti-goals (a failure even if it works)

- Killing a slow stream that would have played. A stall notice must not unmount the player.
- Presenting a guess as a fact. A browser cannot tell "CORS blocked" from "server down" from "DNS failure" (all arrive as one `TypeError`),
  so the message for that case says so.
- Changing anything for Twitch or YouTube pages, or breaking the Twitch no-overlay rule (nothing drawn over the Twitch embed; not relevant here, but
  shared files stay safe).
- Storing or sending a pasted URL anywhere new. Stream addresses can carry tokens; this change adds no storage and no network call except
  the probe below, made from the visitor's own browser to the address they pasted.

## Constraints

- `SmartUrlInput.tsx`, `PlayerHost.tsx`, `FallbackCard.tsx` and `types/player.ts` are shared with the coming YouTube Live work. Keep edits inside the
  hls/dash branch, additive and optional, so the two efforts merge cleanly.
- Owner flow: feature branch, tests first, PR, rebase merge, Co-Authored-By in the PR description only (never in commits). On this machine vitest sometimes
  fails with a transient spawn UNKNOWN or timeout: re-run before treating it as real.
- `/hls-dash/:id` must stay the shape of every player address, because `isPlayerPagePath`, the matrix-rain freeze, the rail gutter and
  `floatingShouldEnd` (all in `App.tsx` / `lib/`) match on it.

## Approaches considered

- **Route.** (1) Make the listing route read `?url` and render the player. Rejected: the listing page and the player page would be one component with two jobs, and
  `isPlayerPagePath` would have to guess. (2) A new top-level route such as `/watch`. Rejected: every path-matching helper above would need a new case.
  **(3) Send pasted links to `/hls-dash/custom?url=…` — chosen.** One reserved id, the existing player page, no helper changes.
- **Stall behaviour.** Fail hard (current `onError`, which advances the fallback chain and unmounts the player) versus a **non-blocking notice** that leaves the player loading.
  Chosen: notice, because a slow origin is common and unmounting turns a slow stream into a dead one.
- **Cause detection.** Guess from the Video.js error code (what we do today, and it is wrong) versus **probe the address with a `fetch` from the visitor's browser**
  and classify the result. Chosen: probe. It is the only way to tell a 404, a web page and an HTTP-on-HTTPS block apart.

## Design

What the owner chose is the scope above (A + B: paste routing, links without an extension, honest errors, Retry, stall detection, a not-found state).
Everything below is how I propose to build it, so each item is my call and open to change.

1. **Routing (my call).** Pasted HLS/DASH links go to `/hls-dash/custom?url=<encoded>`, optionally `&as=hls|dash|mp4`. A helper `buildStreamPath(url, as?)` in `src/lib/routes.ts`
   builds it, so the paste box and the redirect share one definition. `custom` is a reserved id that no demo may use. `ProtocolPage` for `hls-dash` with a `url` query redirects (replace)
   to that path. *My call:* `as` is the only extra parameter and overrides detection; absent means "detect from the address".
2. **Unrecognised links (my call).** In `SmartUrlInput`, a URL-shaped paste that is not Twitch, YouTube, HLS or DASH navigates to the same path with no `as`. The page treats an
   unrecognised address as HLS (Video.js already sets the HLS source type only on `.m3u8`, so the page passes the forced type through detection, e.g. an exported
   `detectURLTypeAs(url, kind)` appended to `urlDetection.ts`). Plain words still mean a Twitch channel; multi-word text still opens the category panel. Unchanged.
3. **Stream probe (my call).** `src/lib/streamProbe.ts`, a pure function with an injectable `fetch` and a timeout: `probeStream(url, kind)` returns one of
   `ok`, `http` (with status), `not-playlist` (200 but no `#EXTM3U` for HLS or `<MPD` for DASH, e.g. a web page), `unreachable` (the `TypeError` case, worded as
   "down, blocked, or the server does not allow other sites"), `mixed-content` (page is https and the address is http; decided without any request).
4. **Error view (my call).** An HLS-specific view (name is the builder's) replaces "Source not supported or autoplay denied": a plain sentence per probe result,
   plus **Retry**, **Open address in a new tab**, **Copy address**, and **Try as HLS / DASH / MP4** when the type was a guess. The wiring through `PlayerHost` is the builder's call
   but must be additive (an optional prop or a branch on `detection.type`) with Twitch and YouTube paths untouched and their tests green.
5. **Stall (my call).** In `VideoJSPlayer` the "failed to load" timer is cleared by `loadeddata` or `playing`, not `ready`. After 12 s with neither, a new optional `onStall` callback
   fires instead of `onError`: the page shows a notice under the player ("Still loading after 12 s — the stream may be slow or unreachable") and runs the probe; the notice goes
   away on `playing`. `onError` stays for real Video.js errors. The same timer rule is applied to the DASH player only if it is a one-line change; otherwise it is left as is and noted.
6. **Not found (my call).** `/hls-dash/<id>` where the id is not a demo and there is no `url` query shows a "No stream called <id>" card with a link to `/hls-dash`.

## Tests first (builder fills the detail)

`SmartUrlInput` (hls, dash, unrecognised URL, Twitch and YouTube unchanged), `ProtocolPage` redirect, `HlsDashPlayerPage` (demo id, `?url`, `as`, unknown id,
error and stall states with a mocked `PlayerHost`), `streamProbe` (one test per result kind with a fake `fetch`), `VideoJSPlayer` stall (fake timers, mocked video.js).
Then check in the browser with the streams from the review: Apple bipbop (VOD), Unified Streaming `scte35.isml/.m3u8` (live), Akamai `cph-p2p-msl…/test/master.m3u8`
(variant 404, the stall case), `example.com/nope.m3u8` (no CORS), an `http://` address, and an unknown id.

## Left to the builder

File and component names; how the error view reaches `PlayerHost`; exact wording (plain, short, no jargon); whether the notice sits above or below the debug panel; how to mock video.js.

## Not verified yet

Safari/iOS native HLS (it does not use the same code path), a real Chrome run (the review used the built-in browser), and the DASH page's behaviour.
