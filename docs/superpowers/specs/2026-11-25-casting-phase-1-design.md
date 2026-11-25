# Casting PRISM, phase 1: HLS / DASH as a set-top box

Status: approved by the owner 2026-11-25. Nothing is built.

**Whose words are whose:** lines marked **Owner** are the owner's decisions. Everything else is a proposal by the writer, shown to the owner as such ("my calls" are listed at the end).

## Intent

**Owner:** cast PRISM to a TV and drive it with the TV's remote. On the HLS / DASH page the remote switches streams "like a set-top box". Phase 1 is HLS / DASH only. Twitch and YouTube come in later phases as PRISM wrapped around their embeds; until then, opening one of their pages while casting says "coming soon".

Success: on the owner's Google TV Streamer (Gen 5) you cast from PRISM, put the laptop away, and flip channels from the couch with the remote that came with the device.

## Goals

1. A Cast button on the HLS / DASH page, shown only when a device that can run the app is found.
2. A receiver page that plays the stream, shows a guide, and takes the remote.
3. PRISM on the computer shows what the TV is doing and can control it.
4. "Coming soon" on Twitch channel and YouTube video pages while casting.

## Non-goals (phase 1)

Twitch or YouTube on the TV. Publishing the Cast app (it stays unpublished: only the four registered devices can run it, and everyone else sees no Cast button). Phone apps. Search on the TV. Starring on the TV. Live rewind on the TV. Captions and audio-track choice. PRISM's own player engines on the TV.

## Anti-goals

- A black or frozen screen with no explanation.
- Needing the computer after casting has started.
- Back quitting PRISM by accident, or PRISM trapping the viewer so Back never leaves.
- A stream's address shown on screen or in a log (addresses can carry tokens; show names and hosts only).
- Breaking the HLS page for people with no Cast device, or in a browser without Cast.

## What was measured (Gen 5 Streamer, 2026-11-25)

Device: "Gen5 Ardmore", Google TV, Chrome 140, 1280x720 page, HDR and Dolby Vision, D-pad and remote supported.

- `ArrowUp/Down/Left/Right`, `Enter` (empty `code`, so match on `key`) and `BrowserBack` reach the page as `keydown` on `window`, with and without a stream playing, when a `<cast-media-player>` element is on the page. Claimed keys (capture phase, `preventDefault` + `stopPropagation`) caused no pause or seek.
- Back can be held: `preventDefault` kept the app running through three presses. Unclaimed, the app was left.
- Holding OK sends `keydown` about every 50 ms after a 400 ms delay, and the `repeat` flag is NOT set. `keyup` was not measured.
- Not measured: the play/pause button, holding an arrow, the other three devices (a Chromecast Ultra, a "Home Max Hub", "Salmon g4"). A device with no remote gets no keys: there the computer is the only control.
- Streams: 2,196 in the list (2,185 HLS, 11 DASH, all https, 1,236 hosts). 77 of 80 sampled hosts answered and all 77 allow the receiver's origin; the 77 were MPEG-TS HLS. The stream checker tests PRISM's origin only, so "working" does not promise the TV can fetch it.
- Engine race, 60 streams: Cast with Shaka started 59 (only a stream dead for every engine failed); Cast's default 58; PRISM's engines 58 in the second round, 57 in the first. Median start 3.2 s for both Cast settings against 2.2 s for PRISM; over 5 s: 17, 21 and 5. PRISM began at a lower resolution on 19 of 58; Cast with Shaka on none.
- Engines loaded into one page disturbed each other. Only one engine may be live on the receiver page.

Throwaway code for both tests is on the local branch `spike/cast-remote`. It is evidence, not a starting point to copy wholesale.

## Approaches

- **A. Cast's own player with a PRISM guide on top (Owner's pick).** Small page, Google's player for HLS and DASH, phone and voice controls come free. Slower starts than PRISM's engines, less detail on failures.
- **B. PRISM's engines on the TV.** About 0.8 s faster starts, same behaviour as the site, but we would build the link between our player and Cast's controls.
- **C. Google's ready-made receiver.** No guide, no remote switching. Dropped.

The owner asked whether PRISM's player gives true additives. The race answered: faster channel flips, not more channels. **Owner:** phase 1 on Cast with Shaka. The engine stays behind one small module so B can replace it later.

## Addresses and registration

- Cast app id `10E81A1E` ("PRISM-Casting", custom receiver, unpublished). The sender reads `VITE_CAST_APP_ID`, default `10E81A1E`.
- Receiver address `https://prism-cast.nooroticx.tv`, IONOS webspace folder `PRISM/casting` (both folders now 755; folders made in the IONOS panel come out 774, which gives a 403).
- Message namespace `urn:x-cast:tv.nooroticx.prism`.
- The history server must allow the new origin: add `https://prism-cast.nooroticx.tv` to `allowed_origins` in the private `config.php` on the host. **Only the owner edits that file, and it must be done before the first test on a device** (an unknown origin gets a 403). No server code changes; `server/config.example.php` gets the same line.

## The receiver (the TV)

A second Vite build in this repository: `cast/` (its own `index.html` and entry), `vite.cast.config.ts`, output `dist-cast/`, script `build:cast`. React, sharing PRISM's pure modules (`streamsApi`, `streamFilter`, `streamSource` helpers); no router, no AppContext, no analytics, no Twitch or YouTube code. Type-checked, linted and tested with the rest; CI also runs `build:cast`. The fonts and colours are PRISM's.

Cast receiver framework v3 from Google's address, `<cast-media-player>` on the page with Google's own overlay hidden so PRISM's banner and guide are the only interface. `useShakaForHls: true`. `disableIdleTimeout` stays off (Google documents it for non-media apps): when nothing plays, Cast closes the app after its own idle time.

### Where the streams come from

The receiver loads `GET /api/streams` itself at launch and again when the guide opens and the list is over 30 minutes old (a refresh that fails keeps the old list; `loadStreamSnapshot` remembers a good answer for the whole session, so it needs a refresh). It never depends on the sender for the list. If the list cannot be loaded it still plays what the sender sent; the guide says "The channel list is not available right now" and Up / Down do nothing but show that line; it tries again each time the guide opens.

The sender sends with every load (in the media's `customData`): the stream id (or null), the kind, the viewer's favorite ids, and the group the page was showing (by name, or null). Favorites are sent again when they change while connected (see Messages). The receiver keeps the last set in memory only.

**Surf list**, what Up and Down move through: the favorites that are in the list, in list order; with none, the streams of the page's group; with no group, the whole list. A playing stream that is not in the surf list (a pasted address, a demo): the first Down goes to the first entry, the first Up to the last. The ends wrap.

### The remote

| Button | Guide closed | Guide open |
|---|---|---|
| Up / Down | previous / next in the surf list, wrapping | move in the guide, wrapping |
| Left / Right | nothing (and kept from Cast, which could seek with nothing on screen) | previous / next group (Favorites, All, then the list's groups; empty ones skipped) |
| OK | open the guide on the playing channel | watch the highlighted channel and close the guide (the playing one just closes it, or is tried again if it failed or ended) |
| Back | first press: "Press Back again to leave" for 3 s; second press within it leaves | close the guide |
| Play / pause and other media keys | left to Cast | left to Cast |

- Keys are taken on `window` in the capture phase. Keys PRISM does not use are never blocked.
- OK and Back act once per press: another `keydown` of the same key is the same press held down when it comes within 600 ms of the first, or within 300 ms once it is repeating (measured: 400 ms to the first repeat, then about 50, the slowest 180; `repeat` is not set). Times are the events' own (`event.timeStamp`), so a busy moment of the device does not look like a new press. So a hold can never leave PRISM or open and shut the guide, and someone who keeps tapping Back at a normal pace still leaves.
- `keyup` ends nothing (a device may send one with every repeat). It is claimed for a key whose press was claimed, because a device may act on the release.
- Holding Up / Down repeats: in the guide, one step per 100 ms. With the guide closed the banner steps through names and only the one it stops on is tuned, 600 ms after the last step. Starts take about 3 s, so tuning each one passed would feel broken.
- The key handling is a pure reducer (state, key, time) -> (state, effects), tested without Cast.
- The guide stands on a channel, not on a row number: a list that changes under it (a refresh, a star on the computer) keeps the highlight.
- A flip that is waiting to be tuned is dropped when the guide opens or the computer picks a channel.
- The guide closes by itself after 15 s with no key. The stream keeps playing under it, visible beside it.

```
┌────────────────────────────────────────────┐
│            (stream keeps playing)          │
│ ┌ ◂ ♥ Favorites ▸ ─┐                       │
│ │   News One       │                       │
│ │ ▸ Sports Live    │   OK watch            │
│ │   Retro Films    │   Back close          │
│ └──────────────────┘                       │
└────────────────────────────────────────────┘
```

The guide is windowed (a group can hold 2,000 streams), laid out for 1280x720, inside a 5% safe margin, text no smaller than 24 px, AA contrast. Rows show the logo if there is one, the name, the country flag.

### What the TV shows

- **Banner** on every tune, for 4 s: logo, name, group. While tuning it stays with "Tuning…".
- **Failure:** Cast reports an error, or the picture has not moved 20 s after tuning: "<name> is not available right now. Press Up or Down for another channel." It stays until the next key, or until Cast closes the idle app after its own time, which is accepted (nothing is playing). No automatic skipping. No error codes on screen.
- **Stall after it had started:** PRISM's own "Buffering…" sign (Google's overlay is hidden, so PRISM draws every sign); after 20 s without movement the failure message, which clears itself if the picture moves again.
- **Paused:** "Paused" and the channel name, for as long as it is paused. The 20 s check does not run while paused.
- **Resuming a live stream** after a pause goes to the live edge; resuming a recording continues where it was.
- **A recording ends:** "<name> has finished. Press Up or Down for another channel."
- **Launched with nothing to play:** the PRISM mark and "Pick a stream in PRISM".
- Only the newest tune may change anything on screen: a late answer from an earlier one is ignored.

### The engine boundary

One module owns playing: `tune(stream)`, `stop()`, and events `playing`, `stalled`, `failed`. Nothing else touches Cast's player. **Live or recording:** streams from the list are LIVE; the built-in demos are BUFFERED; a pasted address is BUFFERED when the local player already knows a finite length, otherwise LIVE. The sender sends its choice with the load; the receiver applies the same rule to its own tunes. A tune is a normal Cast load made by the receiver itself with the stream's name and logo as metadata, so phones, Google Home and the sender see the right title after a flip with the remote.

What Cast really does was measured on the receiver framework in desktop Chrome (2026-11-25): its own loads pass through the load interceptor too; the order is interceptor, MEDIA_FINISHED INTERRUPTED (the old stream), PLAYER_LOADING, LOADED_METADATA, `load()` resolves; a second load waits until the first has given up (3.7 s for a dead address) and no ERROR is sent for the first; a dead stream gives ERROR with a code, then ERROR 905, and a rejected `load()`; a load the interceptor refuses also ends the stream that was playing; `getLiveSeekableRange()` is null for some live streams. Movement means the picture's clock going on at about real speed: a jump (to the live edge, or a window sliding under a stalled stream) is not play.

Tuning is part of phase 1: after it works, the same 60 streams are run with a few settings (starting bandwidth, buffer before play, Shaka's streaming goals). Aim: median start within 0.5 s of PRISM's 2.2 s and no more than 10 of 58 over 5 s, with nothing lost in started streams. It is an aim, not a gate: the best setting found ships, with the numbers written into this document. The engine is revisited only if the owner finds flips too slow.

## The sender (PRISM on the computer)

- Google's sender script is loaded only on the HLS / DASH page, or when this tab was already casting (a `sessionStorage` mark). Other visitors never load it. If it fails to load, or the browser has no Cast, there is no button and nothing else changes.
- A `CastProvider` in the app layout holds the session, so casting survives moving between pages. Auto-join is scoped to the tab (and origin): a reload rejoins, and a second PRISM tab is untouched and plays locally as usual. Closing the tab leaves the TV playing; a new tab can cast to it again.
- **Button:** beside the pop-out button above the player, in the same style, shown only when Cast reports a device. It opens Chrome's own device picker.
- **Starting:** the page's stream goes to the TV, the local player goes away (one stream, not two), and a floating video closes first. MP4 and other non-HLS/DASH addresses, and any `http://` address, are not castable: the button is disabled with the reason as its title.
- **While casting on the HLS page** a panel takes the player's place: "Playing on <device>", the channel the TV is on now (it follows the remote), its state (tuning, playing, not available), Play / Pause, Stop casting. The TV is tuned from the page only by an explicit choice: a card in the list (also the one already in the address) or a pasted address. Those change the address as today. Back / Forward, opening the page from the header, a reload and the list arriving never tune the TV. A flip by remote changes the panel, not the page's address. Play / Pause reads and drives Cast's own remote player.
- **Stop casting** clicked on the page: the local player returns and plays, on the channel the TV was last on if it is in the list (the address is replaced, not pushed), otherwise on the page's stream. **The session ending any other way** (Back on the TV, another app, the network): nothing starts by itself. The HLS page shows "Casting ended" with a Play here button, so an unattended computer never starts making sound. On any other page nothing happens except the coming-soon line going away.
- **Coming soon:** on `/twitch/:channel` and `/youtube/:videoId` while connected, one line above the player: "Casting Twitch (YouTube) is coming soon. Your TV keeps playing <name>." The page otherwise works as today and nothing is sent to the TV. Never over the player.
- The app's other notices and the "PLAYBACK" log are unchanged; the log notes "casting to <device>" with no address.

## Messages

Media control uses Cast's standard messages. On the namespace, JSON, `v: 1`, unknown types ignored, parsed strictly on both sides (the same rules as `streamsApi`: ids by pattern, addresses http(s) only):

- receiver to sender: `now` `{ id | null, name, state: 'tuning' | 'playing' | 'buffering' | 'paused' | 'failed' | 'ended' | 'idle' }`, on every change and to each sender that connects.
- sender to receiver: `context` `{ favorites: string[] }`, sent only when the viewer stars or un-stars something while connected. The group travels only with a load made by an explicit choice: browsing groups on the computer, or a tab reconnecting, never changes what Up and Down do on the TV. Favorites are capped at 1,000 ids, about 14 KB, under Cast's 64 KB limit.

A sender older or newer than the receiver keeps basic play and stop. Anyone on the owner's network with the device can send messages; the receiver never runs anything it is sent, and only plays http(s) addresses.

## Deploying the receiver

`tools/deploy-cast.mjs`: builds, then uploads `dist-cast/` to `PRISM/casting` over the same pinned-host-key SFTP code as the history server (`server/tools/lib/historyDeploy.mjs`), password from the environment as documented there. Only that file's `sftpUpload`, `passwordFrom` and `validateConfig` fit; its planner drops everything but the server's own folders, so this tool has its own. The build sets `publicDir` so the site's `public/` is not copied. Dry run by default; `--go` uploads, hashed assets first and `index.html` last. It only adds and replaces files. Not in CI (the password stays out of GitHub). The spike's files on the host are removed once, by hand, with the owner's yes. Deploying the receiver and deploying the site are separate; the message version covers the gap. An `.htaccess` sets `index.html` to no-cache.

## Testing

- Unit: surf list, key reducer (including held keys and double Back), message parsing, tune races, failure timing, guide windowing, castable kinds, provider state with a fake Cast.
- Existing HLS page tests keep passing with no Cast in the environment.
- In a desktop browser: the receiver page with a `?dev` mode that stands in for Cast (keyboard drives it); it is left out of the production build.
- On the Gen 5, by the owner, from a written checklist: cast, flip up and down, hold Down, guide, groups, Back twice, dead stream, close the laptop and keep flipping, rejoin, stop casting, coming soon on a Twitch page. One run on the Ultra through the TV's own remote to learn what arrives there; whatever it shows is recorded, not required.

## Left to the builder

File names and component split, guide visuals within the limits above, exact wording of small labels, how Cast's overlay is hidden, caching details, test structure.

## Calls made by the writer, for the owner to check

1. Up goes to the previous channel and Down to the next (the guide's own direction).
2. Favorites are the surf list; with none, the page's group; with none, everything.
3. OK opens the guide; Left / Right do nothing while it is closed.
4. Back asks twice before leaving.
5. A dead stream stays on a message instead of skipping by itself.
6. Holding Up / Down shows names and tunes only where it stops.
7. Stopping the cast brings the TV's channel back to the computer.
8. The app stays unpublished in phase 1.
9. The tuning target is an aim, not a gate.
10. A held key is one press (600 ms window); leaving takes two separate Backs.
11. Only an explicit choice on the page tunes the TV; browsing and reloading never do.
12. Casting belongs to the tab that started it; a second tab plays locally.
13. When the cast ends by itself the computer stays silent until Play here is pressed.
14. Listed streams are treated as live; resuming a paused live stream jumps to live.

## Review

A fresh builder read this document (2026-11-25). It found the held-key window contradicted the measurement (fixed), missing paused / buffering / ended states, and open questions on live or recording, what tunes the TV, second tabs, autoplay after a cast ends and when the group is sent. All are settled above as the writer's calls; none needed the owner.
