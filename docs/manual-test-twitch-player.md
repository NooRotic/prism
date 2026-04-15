# Twitch Player — Manual Test Checklist

## Prerequisite: Cloudflared HTTPS tunnel

**Twitch embeds do not work on localhost:5173.** The Twitch SDK assumes port 80
for `parent=localhost` with no override, so any Vite dev server on a non-80 port
silently fails to render embeds. To manual-test locally, run a Cloudflared
tunnel that exposes Vite on a real HTTPS hostname.

Install (one-time):

```bash
# Windows (winget)
winget install --id Cloudflare.cloudflared
# macOS
brew install cloudflared
```

Run before each manual test session (two terminals):

```bash
# Terminal 1 — start Vite (dev server pinned to port 5000)
cd C:/Dev/projects/twitch-glaze-me
npm run dev

# Terminal 2 — tunnel Vite to an https URL
cloudflared tunnel --url http://localhost:5000
```

Cloudflared prints an `https://<random>.trycloudflare.com` URL. Open THAT URL
in your browser, not `localhost:5000`. Embeds will now receive a matching
`parent=<random>.trycloudflare.com` and load correctly.

> Alternative: push the branch and test against the GitHub Pages deploy
> (`https://noorotic.github.io/twitch-glaze-me/`). Slower iteration. Note
> the lowercase `noorotic` — GitHub Pages normalizes usernames regardless
> of how they're capitalized in the account.

---

## Test matrix

Replace the placeholder URLs with currently-valid ones before testing.

| # | URL type        | Example                                  | Expected engine  | Expected state                                         |
|---|-----------------|------------------------------------------|------------------|--------------------------------------------------------|
| 1 | Clip            | `https://clips.twitch.tv/<slug>`         | `twitch-iframe`  | Clip plays, `Content ID: <slug>`, chain starts at iframe |
| 2 | VOD             | `https://twitch.tv/videos/<id>`          | `twitch-sdk`     | VOD plays, `Content ID: <id>`                          |
| 3 | Live stream     | `https://twitch.tv/<live-channel>`       | `twitch-sdk`     | Stream plays, `Content ID: <channel>`, Offline: no     |
| 4 | Offline channel | `https://twitch.tv/<offline-channel>`    | `twitch-sdk`     | Offline overlay shown, Offline: yes, chain NOT advanced |
| 5 | Malformed       | `https://twitch.tv/`                     | `fallback`       | FallbackCard with "Open Link"                          |

## For each test

- [ ] Engine in debug overlay matches the "Expected engine" column
- [ ] Content ID matches (streams → channel, clips → slug, VODs → numeric id)
- [ ] `Parent:` row shows the cloudflared hostname
- [ ] No console errors

## Specific behaviors

- [ ] **Test 1 — clip skips SDK**: Debug overlay should show `Chain: twitch-iframe > fallback` (two steps, not three). It should NEVER show `twitch-sdk`.
- [ ] **Test 4 — offline overlay**: The "Channel is offline" card appears over the player. The Twitch SDK remains mounted underneath — inspect DOM: `<div id="twitch-embed-*">` still present.
- [ ] **Test 4 — no chain advance on offline**: Debug overlay shows `Fallback: step 0 / 2`. It must NOT have advanced to `twitch-iframe`.
- [ ] **Auto-recover (opportunistic)**: When an offline channel goes live, the overlay disappears and the stream begins playing without a refresh. (Hard to schedule; skip if no candidate channel.)
- [ ] **Force advance**: With debug overlay open on a working stream, click `Force advance →`. Engine switches to `twitch-iframe`; iframe loads; `step 1 / 2`. Click again → `fallback`; `step 2 / 2`.
- [ ] **Retry from start**: Click `Retry from start`. Engine resets to `twitch-sdk` for streams/VODs, or `twitch-iframe` for clips; `step 0`; offline flag cleared.
- [ ] **Script-load timeout** (optional, DevTools): Block `https://embed.twitch.tv/embed/v1.js` in DevTools Network. Reload with a stream URL. Within 5s the chain should advance to `twitch-iframe` with `Error: Twitch Embed timed out after 5s`.
- [ ] **PLAYBACK_BLOCKED handling** (optional, DevTools): Disable autoplay in browser settings. Load a stream URL. The chain should advance with `Error: Autoplay blocked by browser`.
- [ ] **Pause event**: Start a VOD, pause it. Open React DevTools and watch props on `PlayerHost` — `handlePause` should have been called. (No visible indicator in the UI yet.)

## Known limitations

- SDK and iframe both use `window.location.hostname` as `parent=`. If the SDK fails due to parent mismatch, the iframe fallback will fail the same way. Not independent failure modes.
- The iframe player can't detect a broken-embed scenario where the iframe loads but Twitch renders an error message inside it. The 5s timeout is our only signal.
- Clips don't fire offline/online events (they're static), so Test 1 will never exercise the offline overlay.

---

# Non-Twitch Players — Manual Test Matrix

The non-Twitch players (Video.js for HLS/MP4, DASH.js for DASH, ReactPlayer
for YouTube) don't need the cloudflared tunnel — they have no `parent=`
restriction. You can test them on plain `localhost:5000`.

## HLS (Video.js)

Paste any of these URLs into the SmartUrlInput:

| Source         | URL                                                                     |
|----------------|-------------------------------------------------------------------------|
| Mux test stream (fast) | `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` |
| Big Buck Bunny | `https://test-streams.mux.dev/pts_shift/master.m3u8`                    |
| Apple sample   | `https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8` |

Expected: debug overlay shows `engine: videojs`, playback starts muted
within 1-2 seconds. The Video.js control bar appears at the bottom with
quality / volume / fullscreen controls.

## DASH (DASH.js)

| Source         | URL                                                                     |
|----------------|-------------------------------------------------------------------------|
| DASH-IF sample | `https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd`             |
| Envivio H.264  | `https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd`          |

Expected: debug overlay shows `engine: dashjs`, playback starts muted after
the manifest loads. Native `<video>` controls (not Video.js).

## YouTube (ReactPlayer)

| URL form         | Example                                      |
|------------------|----------------------------------------------|
| `youtube.com/watch?v=` | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| `youtu.be/`      | `https://youtu.be/dQw4w9WgXcQ`               |
| `youtube.com/live/` | `https://www.youtube.com/live/<channel>`  |

Expected: debug overlay shows `engine: reactplayer`, YouTube's own iframe
embed mounts and plays muted.

## Cross-player checklist

For each of HLS / DASH / YouTube:

- [ ] Debug overlay (Settings icon in player bottom-right) shows the
      correct engine name
- [ ] `Content ID: (none)` row is acceptable — these engines don't have
      a concept of content id like Twitch does
- [ ] **Debug Panel** below the stats row is visible when debugMode is on;
      shows `engine: videojs` (or dashjs / reactplayer) in the top-right pill
- [ ] The placeholder body "Playback metrics will appear here when a
      player reports them" is visible inside the Debug Panel
- [ ] No console errors
- [ ] Pause + resume works (manual check via player controls)
- [ ] Close the tab or navigate home via GLAZE ME — no orphaned network
      requests or memory leaks (inspect DevTools Network + Memory)

## Fallback chain verification

Each non-Twitch engine has a 2-step chain: `<engine> → fallback`. To test
the fallback:

- **HLS**: paste an invalid `.m3u8` URL like `https://example.com/nonexistent.m3u8`.
  Video.js fails to load → fallback advances to the FallbackCard with
  "Unable to Play" + the error message.
- **DASH**: same, but with an invalid `.mpd`.
- **YouTube**: an invalid video id like `https://www.youtube.com/watch?v=_____invalid_____`.
  react-player's onError fires → fallback.

In each case the debug overlay should show `step 1 / 1` (the max step
in a 2-step chain).
