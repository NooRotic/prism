# Video Pop-out (floating video window) — Design

**Status:** Draft for the owner's review. Nothing is built. The riskiest unknowns were settled by a
throwaway test in the owner's Chrome (see "Evidence"); what is still unproven is listed under
"Owed in the owner's Chrome".
**Date:** 2026-11-06

---

## Intent

The owner wants to keep watching a stream while doing something else: pop the video out of PRISM,
shrink it into a small window that **always stays on top**, then work in other tabs or other apps
(reading, talking to Claude) with the stream still in the corner of the screen.

A normal pop-out window cannot do that: a web page cannot make an ordinary window "always on top".
Chrome's **document picture-in-picture window** can. It floats above every other window, the viewer
can resize it, and the page decides what it contains (here, only the player).

Two side benefits. A video that lives in its own window never scrolls out of view, which was the
parked "video pauses when I scroll away" problem. And nothing the main window draws can cover it, so
the rail and slide-down panels can no longer pause it (see "Non-goals" for the rail itself).

## Decided by the owner (2026-11-05/06)

- The use is picture-in-picture: small, always on top, while working elsewhere.
- **While the video floats, the chat fills the space where the video was.**
- **The floating window follows the channel the viewer opens in the main PRISM window.**
- Sound must work. (It is muted by default in a fresh window; one click fixes it, see "Sound".)

## My calls (the owner has not seen these; they are open to change)

1. **Where the control lives:** next to "Pop out chat" in the chat header, and in the strip beside the
   player when chat is hidden or popped out. Never over the video. One button whose label flips
   between "Pop out video" and "Bring video back", as the fill and fullscreen buttons already do.
2. **Twitch live channels only, for now.** YouTube, HLS and DASH pages, clips and VODs are not
   floated. Starting a clip or VOD from the page while the live video floats **brings the video back
   to the page** and plays the clip inline, because the page's player area is empty while floating.
3. **The plain `/view/<channel>` window** (an ordinary tiled window, no always-on-top) is **not part of
   this work**. The owner's old fill-mode note called it the next step; this replaces it for now.
4. **Chrome and Edge only.** Where the browser has no picture-in-picture window API, or the page is
   not a secure context, the button is not shown.
5. **A reload or a closed tab ends the floating window and nothing re-attaches.** The chat pop-out
   re-attaches after a reload; the video cannot, because the browser ties this window to the tab
   that opened it. The page simply loads normally.
6. **Every open starts with a start screen** ("Click here to start with sound"), because that click is
   what lets Chrome play sound. The stream starts when it is clicked.
7. **Size:** opens at 480×270 (16:9), and the last size the viewer left it at is remembered. The
   page cannot choose where the window appears; Chrome decides.
8. **While floating, the dock-side swap and the drag handle are hidden** (there is no player to be
   beside). The remembered side and player/chat split are kept for when the video returns. Fill mode
   and fullscreen keep working and act on the chat-only row.
9. **If chat is hidden or popped out while the video floats**, the player area shows a plain panel,
   "The video is in a floating window", with the same "Bring video back" button.
10. **From a page with no dock** (the hub, search, a YouTube page) the window just keeps playing its
    last channel; the viewer closes it with its own close button or Chrome's back-to-tab button.

## Behaviour

**Opening.** The control runs inside the viewer's click and asks Chrome for the window. At once the
page's own player is removed (its stream stops), the chat widens into the freed space, and the
floating window shows the start screen. Clicking it creates the player in that window, autoplaying
with sound.

**Following.** The floating state belongs to the app, not to one page, so moving between
`/twitch/:channel` pages does not close or orphan the window. When the channel in the address
changes while floating, the floating player switches to it, with the chat beside it in the page
following as it does today. Opening a channel while floating plays only in the floating window; the
page never mounts a second player, so there is no second stream or double audio.

**Returning.** Whatever ends the window (its close button, Chrome's back-to-tab button, the page's
"Bring video back", the opening tab closing or reloading, a clip being started) switches the page
back: the player returns to its wrapper, the chat gives the space back, and the stream restarts in the
page with its normal autoplay. "Floating" is derived from the window actually existing, so a
closed window can never leave the page stuck on the chat-only layout (the same rule the chat pop-out
follows).

**Failures.** If Chrome refuses the window (no click, a window already open), show a short notice in
the same place and style as the chat pop-out's "Pop-up blocked" notice, and change nothing else.

**Offline channel.** The floating player shows Twitch's own offline screen; nothing extra is built.

## Constraints (facts, not choices)

- Needs Chrome or Edge 116+ on a secure context (https, or localhost), and must be started from a click.
- The window belongs to the tab that opened it, and there is one per tab at a time.
- An iframe reloads when it changes documents, so the player is created fresh in the window and the
  stream restarts (about two seconds in the test).
- **Sound:** Chrome only allows sound after a click in the page. A new window has had none, so a player
  created at once plays muted. Creating the player only after a click inside the window gives sound.
  The click belongs to the window's document, so later channel changes in the same window should
  not need another (to be confirmed, see "Owed").
- **The window has its own `window`, `document` and Twitch global.** The Twitch script must be loaded
  into it, and the embed's `parent` must be the main page's hostname, passed explicitly (the window's
  own origin reads "null"). PRISM's existing `TwitchEmbedPlayer` assumes the page's own `window` and
  `document`, so it cannot be dropped in unchanged.
- The window has no PRISM styles. It holds only the start screen and the player, so inline styles or a
  tiny stylesheet are enough. Nothing is ever drawn over the player in it either (Twitch refuses to
  play an embed that anything covers).
- Playback continues while the opening tab is in the background (confirmed).
- jsdom has no such API, so tests need an injected fake of the window opener, as the chat pop-out
  does with `fakePopoutBus`.

## Non-goals

- The plain `/view/<channel>` tiled window (call 3).
- Floating YouTube, HLS, DASH, clips or VODs; any floating-window controls of our own (volume and
  pause are Twitch's own, inside its player).
- Fixing the rail pausing the video on the page. That is a separate small change: the expanded rail
  overlays about 200px of the player and Twitch pauses a covered, playing embed. A floating video
  makes it moot while floating, but the page still needs its own fix.
- Combined chat, restyling Twitch's player, mobile layouts.

## Anti-goals (a failure even if it technically works)

- Anything drawn over the player, in the page or the window.
- The page left stuck in the chat-only layout after the window is gone.
- Two players playing at once, or sound doubled.
- The window going silent or asking for a click on every channel change.

## Evidence so far

A throwaway page (`public/spike-pip.html`, on the local-only `spike/video-pip` branch, never merged)
ran in the owner's Chrome 156 on Windows on 2026-11-06:

- The window opened, and Twitch's SDK player created inside it fired ready within a second and was
  playing about two seconds after opening, with Twitch's visibility check true for the three minutes
  it stayed open. `parent` was the page's hostname.
- The window stayed on top of other apps, and kept playing while other tabs were focused.
- A player created at once played muted. The same player created after a click inside the window had
  sound.
- Covering a third of an inline player on the page flipped Twitch's visibility check to false at once and
  paused it; the floating player's check never moved, so the page cannot disturb it.
- The plain-iframe player was not tested in the window (a bug in the page, since fixed, ran the SDK
  player twice). It does not matter: the SDK player is what PRISM uses.

## Existing pieces to build on

- `ChatDock` lays out the player wrapper and chat row, and already renders a chat-only or
  player-only row; it is mounted only on the Twitch player page.
- `ChatHeader` and `ChatStrip` carry the existing controls; `useChatPopout` is the pattern for "state
  derived from the window actually existing", for the blocked notice, and for saved bounds
  (`loadBounds` / `saveBounds` in `lib/chatPopout.ts`, keys in `config/storageKeys.ts`).
- `TwitchPlayerPage` renders `PlayerHost` into the dock and owns the channel route param.
- `TwitchEmbedPlayer` has the Twitch script loading and the options the page player uses
  (`muted: false`, with a muted fallback after 3 seconds). The window's player is simpler and does not
  need the fallback chain.
- `followsStore.ts` (PR #64) is a pattern for state that lives outside any one page.

## Left to the builder

Where the floating state lives (a provider or a small module store, so long as it outlives the
routes); how the window's player is built (a small dedicated module or an adapted
`TwitchEmbedPlayer`); the exact copy and icon; keyboard behaviour; the minimum and maximum saved
size; how the start screen is styled.

## Owed in the owner's Chrome (after it is built)

1. Switching channels in the page switches the floating player, with sound and no second click.
2. Closing the window by its X, by Chrome's back-to-tab button, and by "Bring video back" each returns
   the video to the page with sound, and the chat gives the space back.
3. Reloading or closing the opening tab closes the window and leaves the page normal.
4. The chat fills the video's space, in fill mode and in fullscreen, and chat text size still works.
5. Opening the rail and the slide-down panels does not touch the floating video.
6. The saved size is used the next time, and a clip started from the page brings the video back.
7. Chat hidden, or popped out, while floating: the panel and its button appear and work.
