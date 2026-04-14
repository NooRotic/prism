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
# Terminal 1 — start Vite
cd C:/Dev/projects/twitch-glaze-me
npm run dev

# Terminal 2 — tunnel Vite to an https URL
cloudflared tunnel --url http://localhost:5173
```

Cloudflared prints an `https://<random>.trycloudflare.com` URL. Open THAT URL
in your browser, not `localhost:5173`. Embeds will now receive a matching
`parent=<random>.trycloudflare.com` and load correctly.

> Alternative: push the branch and test against the GitHub Pages deploy
> (`https://nooROtic.github.io/twitch-glaze-me/`). Slower iteration.

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
