# Playback debug output and rendition fallback (design)

Date: 2026-11-14. Approved by the owner in chat the same day (with the additions under "Owner's additions"). Builds on the HLS
page of piece 2 (`2026-11-13-playlist-admin-design.md`, "Piece 2 as built").

## Intent

Two things the owner asked for after trying the HLS page and the Playlist preview.

1. **The player gives up too easily.** `Apple 4K HEVC` plays on a wide `/hls-dash` page and fails in a small player (the 640 px
   Playlist preview, a narrow window). Video.js picks the smallest rendition at least as wide as the player, then the one with
   the highest bandwidth; at small sizes that is an HDR10 HEVC rendition this machine cannot decode. Video.js treats an append
   (decode) failure as fatal (`MEDIA_ERR_DECODE`, code 3), so PRISM shows "Can't play this stream".
2. **Errors say too little.** The owner wants the user to see what the player is doing, and that it is real running code: a
   verbose debug output in the "About this stream" panel, shown when playback fails or is being retried, "super verbose with
   whatever we have", so a pasted report supports a "debug it, then fix it" way of working.

## Goals

- A decode failure of one video format (HEVC, Dolby Vision, AV1, VP9) no longer ends playback while another format of the same
  stream exists: the player avoids that format and reloads, at most twice, and then fails as it does today.
- The About panel shows a **PLAYBACK** button (amber while the first attempt loads, red while retrying or after a failure,
  green once playing), a **Console output** field with the last two log lines (pass or fail), and, when playback is failing or
  retrying (or when the button is pressed), the verbose output with every attempt, plus a **Copy report** button.
- The same status, console output and verbose output sit under the Playlist preview.

## Non-goals

- No new playback engine and no change to the order of the fallback chain.
- No checker (piece 3). Nothing is sent to a server: the log lives in the page.
- No change to `src/types/player.ts` or `src/components/search/SmartUrlInput.tsx`.

## Approaches

Rendition fallback:
1. **React to a decode failure (chosen):** note which video format failed, mark every rendition of that format off, reload.
   Video.js's two selectors (`STANDARD_PLAYLIST_SELECTOR`, `INITIAL_PLAYLIST_SELECTOR`) both skip a rendition marked
   `disabled`, so the same mark works for the first pick and for later ABR picks.
2. Check the browser up front (`MediaCapabilities`): rejected, the browser says HEVC is supported and only a real decode shows
   the problem.
3. Only offer H.264: rejected, it removes HEVC and 4K from machines that can play them.

Debug output:
1. **A small log store the engines write to and the panel reads (chosen).**
2. Grow the existing debug overlay only: rejected, it is hidden by default, sits over the video, and is not in the panel.

## Design

- `src/lib/playbackLog.ts`: one module-level session (the page plays one stream at a time): `status`
  (`idle | starting | retrying | playing | failed`), `attempts`, entries `{at, level (info|ok|warn|error), source, message,
  data?}` (the last 300), the last inspection of the player (media element and rendition state taken when it failed), and the
  list of avoided formats. A log call before `beginPlayback` does nothing, so Twitch and YouTube pages cost nothing.
  `formatPlaybackReport` turns the session plus the browser environment into plain text.
- `src/lib/renditionGuard.ts`: format family of a codec string, the avoided set (kept for the page session), marking
  renditions off without ever marking all of them, the pure decision `planDecodeRecovery`, and the one-time install of the two
  wrapped selectors.
- `src/lib/playbackEnvironment.ts`: user agent, pixel ratio, viewport, MSE and a codec support table (H.264, HEVC, Dolby
  Vision, AV1, VP9, AAC, HE-AAC, AC-3, EC-3, Opus), and a `MediaCapabilities.decodingInfo` line for a codec string.
- `VideoJSPlayer.tsx`: log loadstart, loadedmetadata, loadeddata, playing, waiting, stalled, retryplaylist, errors (code,
  message, details), rendition changes (from the existing 1 Hz tick) and the 12 s stall; on code 3 apply the recovery above.
  `DashJSPlayer.tsx` logs its start, stream initialised, playing and errors. `PlayerHost.tsx` logs each engine hand-over.
  `StreamPlayerPanel.tsx` begins the session, logs Retry and sets `retrying` / `failed`.
- `src/components/streams/PlaybackDebug.tsx`: the PLAYBACK button (a real button; pressing it shows or hides the verbose
  output), Console output (the last two lines, green for pass, red for fail), the verbose output in a monospace scrolling
  block, and Copy report. It opens by itself while the status is `retrying` or `failed`.
- `AboutPanel.tsx` shows it under the metadata and does not fold while playback is failing or retrying (and reopens a folded
  panel when that starts); `StreamPreview.tsx` shows it under the player.

## Owner's additions (2026-11-14)

The PLAYBACK button (red while retrying, green once playback is reached); show the failed attempts when retrying; a "Console
output" field with the last two log lines, pass or fail. The aim: the user sees player actions, which makes it plain the
player is real running code.

## Calls made without the owner (for them to check)

- An amber "starting" state for the first attempt, so a healthy stream does not flash red on every load.
- Addresses in the report keep scheme, host and path; query values show as `***` and any `user:password@` is hidden, because
  stream addresses can carry tokens.
- The log keeps the last 300 entries; the avoided formats last until the page is reloaded.
- At most two recoveries per stream, then the error card as today.
- These commits go on PR #82 (not merged yet), keeping the HLS page work together.

## Left to the builder

Exact wording, spacing and colours (use the existing CSS variables); how much of the Video.js internals to read for the
inspection (only what is cheap and safe, each read guarded).
