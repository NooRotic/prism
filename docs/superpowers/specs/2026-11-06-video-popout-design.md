# Video Pop-out (floating video window) — Design

**Status:** Approved by the owner 2026-11-06 and implemented on `feat/video-popout` (not pushed); the
checks in the owner's Chrome are still to do (see the end). A fresh reviewer read it as the builder;
its answers are folded in below (the calls and the corrected claims). The riskiest unknowns were
tested in the owner's Chrome on localhost (see "Evidence"); three more were settled by a second
test (see "Settled by a second test"), and what only the deployed site can show is under "Owed in
the owner's Chrome".
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
the rail and slide-down panels cannot pause it (see "Non-goals" for the rail itself).

## Decided by the owner (2026-11-05/06)

- The use is picture-in-picture: small, always on top, while working elsewhere.
- **While the video floats, the chat fills the space where the video was.**
- **The floating window follows the channel the viewer opens in the main PRISM window.**
- Sound must work. (It is muted by default in a fresh window; one click fixes it, see "Sound".)

## My calls (the owner has not seen these; they are open to change)

1. **Where the control lives:** next to "Pop out chat" in the chat header, and in the strip beside the
   player when chat is hidden or popped out. Never over the video. One button whose label flips
   between "Pop out video" and "Bring video back", as the fill and fullscreen buttons already do.
   The chat header is hidden below the `md` breakpoint, so below it the same control must live in a
   slim bar above the chat: "Bring video back" has to be reachable at every width.
2. **Twitch live channels only, for now.** YouTube, HLS and DASH pages, clips and VODs are not
   floated. The control is hidden while the page is playing a clip or VOD, has no channel, or the
   browser lacks the API. Starting a clip or VOD from the page while the live video floats (the
   clip and VOD cards, the profile sidebar and the URL box all do it through `PLAY_URL`) **ends the
   floating window and plays the clip inline**, because the page's player area is empty while floating.
3. **The plain `/view/<channel>` window** (an ordinary tiled window, no always-on-top) is **not part of
   this work**. The owner's old fill-mode note called it the next step; this replaces it for now.
4. **Chrome and Edge only.** Where the browser has no picture-in-picture window API, or the page is
   not a secure context, the button is not shown.
5. **A reload or a closed tab ends the floating window and nothing re-attaches.** The chat pop-out
   re-attaches after a reload; the video cannot, because the browser ties this window to the tab
   that opened it. The page simply loads normally.
6. **Every open starts with a start screen** ("Click here to start with sound"), because that click is
   what lets Chrome play sound. The stream starts when it is clicked. If the channel changes before the
   click, the latest channel is the one that starts.
7. **Size:** opens at 480×270 (16:9), and the last size the viewer left it at is remembered under a
   new storage key, as width and height only. The chat's saved bounds (which hold a position and a
   200px minimum) are a different thing and are not reused. The page cannot choose where the window
   appears; Chrome decides. **Twitch pauses a player in a window that is too small** (seen in the
   second test), so a remembered size below the known-good 480×270 is never restored: it is raised
   to 480×270 when the window opens. The viewer can still shrink a live window; where Twitch then
   pauses it is Twitch's own behaviour and nothing here fights it.
8. **Layout while floating.** The row keeps the height it had with the video, so the page below does
   not jump, and the chat takes the full width of the row. The dock-side swap, the drag handle and the
   resize bar are hidden (there is no player to be beside); the remembered side and split are kept
   for when the video returns. Fill mode and fullscreen keep working and act on the chat-only row.
   The chat must not reload when the video floats or returns, so its place in the render tree stays
   fixed.
9. **If chat is hidden or popped out while the video floats**, the player area shows a plain panel,
   "The video is in a floating window", with the same "Bring video back" button.
10. **Pages that play their own video end the floating window** (YouTube, HLS/DASH, a Twitch clip or
    VOD), so two things never play at once. Pages with no video (the hub, search, the protocol
    listings) leave it playing its last channel; the viewer closes it with its own close button or
    Chrome's back-to-tab button. Opening another live Twitch channel switches it to that channel.
11. **If the player inside the window fails** (the Twitch script is blocked, the embed will not start,
    or it never becomes ready), the window closes and the video returns to the page, where the existing
    fallback chain deals with it. No second recovery path is built for the window.
12. **A channel switch uses `setChannel` on the existing player.** The second test showed that both
    `setChannel` and recreating the player keep the sound with no second click, and `setChannel` is
    faster. Recreating the player is the fallback if `setChannel` is missing. If a switch ever lost
    the sound, the window would show the start screen again (one click) rather than playing silent.

## Behaviour

**Opening.** The control runs inside the viewer's click and asks Chrome for the window. Only when
that request succeeds does the page switch: its own player is removed (its stream stops), the chat
widens into the freed space, and the floating window shows the start screen. Clicking it creates the
player in that window, autoplaying with sound. If Chrome refuses (no click, a window already open),
nothing changes and a short notice appears directly above the player-and-chat row, never over the
player ("Couldn't open the floating window. Click the button again."). One place for every entry point,
because the strip is too narrow to hold text. In fill mode the row covers the whole window and so
covers the notice; that is accepted, since a refusal is rare.

**Following.** The floating state belongs to the app, not to a page. A change of `:channel` keeps the
same `TwitchPlayerPage` and `ChatDock` mounted, but leaving the dock page for a page with no video
(call 10) unmounts them, and the window must survive that. Opening a channel while floating plays
only in the floating window; the page never mounts a second player, so there is no second stream
or double audio.

**Returning.** Whatever ends the window (its close button, Chrome's back-to-tab button, the page's
"Bring video back", the opening tab closing or reloading, a clip being started, a failing player)
switches the page back: the player returns to its wrapper, the chat gives the space back, and the
stream restarts in the page with its normal autoplay. "Floating" is derived from the window actually
existing, so a closed window can never leave the page stuck on the chat-only layout (the rule the
chat pop-out follows).

**Offline channel.** The floating player shows Twitch's own offline screen; nothing extra is built.

## Constraints (facts, not choices)

- Needs Chrome or Edge 116+ on a secure context (https, or localhost), and must be started from a click.
- The window belongs to the tab that opened it, and there is one per tab at a time.
- An iframe reloads when it changes documents, so the player is created fresh in the window and the
  stream restarts (about two seconds in the test).
- **Sound:** Chrome only allows sound after a click in the page. A new window has had none, so a player
  created at once plays muted. Creating the player only after a click inside the window gives sound.
- **The window has its own `window`, `document` and Twitch global.** The Twitch script must be loaded
  into it, and the embed's `parent` must be the main page's hostname, passed explicitly (the window's
  own origin reads "null"). PRISM's `TwitchEmbedPlayer` assumes the page's own `window` and
  `document`, so it cannot be dropped in unchanged. It also waits on the page's
  `requestAnimationFrame`, and a hidden opening tab never fires one: the viewer may switch tabs
  before clicking start, so anything the window's player waits on (frames, timers) must be the
  window's own.
- The window has no PRISM styles. It holds only the start screen and the player, so inline styles or a
  tiny stylesheet are enough. Nothing is ever drawn over the player in it either (Twitch refuses to
  play an embed that anything covers).
- Playback continues while the opening tab is in the background (confirmed).
- The repo has no type definitions for the API; a local declaration is needed.
- jsdom has no such API, so tests need an injected fake of the window opener, as the chat pop-out
  does with `fakePopoutBus`. The fake needs a real second `Document`, `pagehide` and `close()`.
- Twitch pauses a player whose window is shrunk too small. The exact floor was not measured; the
  default 480×270 plays. Chrome lets the viewer drag the window much smaller than that.

## Non-goals

- The plain `/view/<channel>` tiled window (call 3).
- Floating YouTube, HLS, DASH, clips or VODs; any floating-window controls of our own (volume and
  pause are Twitch's own, inside its player).
- Fixing the rail pausing the video on the page. That is a separate small change: the expanded rail
  overlays about 200px of the player and Twitch pauses a covered, playing embed. A floating video
  makes it moot while floating, but the page still needs its own fix.
- The debug panel showing the floating player (it will show nothing while floating).
- Combined chat, restyling Twitch's player, mobile layouts.

## Anti-goals (a failure even if it technically works)

- Anything drawn over the player, in the page or the window.
- The page left stuck in the chat-only layout after the window is gone.
- Two players playing at once, or sound doubled.
- The window going silent, or asking for a click on every channel change (call 12 is the accepted
  fallback only if the test shows there is no way around it).
- The chat reloading when the video floats or returns.

## Evidence so far

A throwaway page (`public/spike-pip.html`, on the local-only `spike/video-pip` branch, never merged)
ran in the owner's Chrome 156 on Windows on 2026-11-06, **on localhost only**:

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

**Not yet seen on the real domain.** Twitch is lenient with `localhost`; whether it accepts
`prism.nooroticx.tv` when the embedding document is the window's own is unproven, and the site only
deploys from `main`, so it can only be seen after a merge. If it fails there, the fallback is a small
PRISM-owned page loaded inside the window (as the chat pop-out does with `/chat/:channel`), so Twitch
sees a real PRISM origin.

## Settled by a second test (2026-11-06, the owner's Chrome, localhost)

A second throwaway page (`public/spike-pip2.html`, never committed) answered three questions:

1. **Channel switch:** the sound survives both ways, by `setChannel` on the existing player and by
   recreating the player in the same window. `setChannel` is faster. (Call 12.)
2. **Fullscreen:** the floating window survives the opener going fullscreen, "perfectly". The
   fullscreen button therefore stays available while floating. Opening the window from inside
   fullscreen was not separately reported; it is on the list below.
3. **Small size:** Chrome lets the viewer drag the window very small, and Twitch pauses the player
   when it gets too small. The exact floor was not measured. (Call 7.)

## Existing pieces to build on

- `ChatDock` renders the player wrapper plus either the chat or the strip. **It has no chat-only
  layout today**: the row's height comes from the player wrapper (`aspect-video`), and the wrapper is
  always rendered, so the chat-only row of call 8 is new layout work. It is mounted only on the Twitch
  player page.
- `ChatHeader` (hidden below `md`) and `ChatStrip` carry the existing controls. `useChatPopout` is
  the pattern for "state derived from the window actually existing" and for the blocked notice, but
  its state is per `ChatDock` and it re-attaches through a `BroadcastChannel`, which a window handle
  cannot do, so the handle needs to live above the routes (the layout that wraps them, or a small
  module store). `followsStore.ts` is **not** a model for the handle: its stores are dropped when
  their last subscriber leaves.
- `TwitchPlayerPage` renders `PlayerHost` into the dock and owns the channel route param; the
  YouTube and HLS/DASH pages mount their own `PlayerHost`.
- `TwitchEmbedPlayer` has the Twitch script loading and the options the page player uses
  (`muted: false`, with a muted fallback after 3 seconds). The window's player is simpler and does not
  need the fallback chain.

## Left to the builder

Where the floating state lives (a provider in the layout, or a module store, so long as it outlives
the routes and does not depend on subscribers); how the window's player is built (a small dedicated
module or an adapted `TwitchEmbedPlayer`); the exact copy and icon; keyboard behaviour; the minimum
and maximum saved size; how the start screen and the slim bar are styled; whether to pass
`preferInitialWindowPlacement` so the saved size wins over Chrome's own memory.

## Owed in the owner's Chrome (after it is built)

1. Switching channels in the page switches the floating player, with sound and no second click.
2. Closing the window by its X, by Chrome's back-to-tab button, and by "Bring video back" each returns
   the video to the page with sound, and the chat gives the space back without reloading.
3. Reloading or closing the opening tab closes the window and leaves the page normal.
4. The chat fills the video's space, in fill mode and in fullscreen, and chat text size still works.
5. Opening the rail and the slide-down panels does not touch the floating video.
6. The saved size is used the next time; a clip started from the page ends the window and plays inline;
   going to a YouTube page ends it.
7. Chat hidden, or popped out, while floating: the panel and its button appear and work; below `md`,
   the slim bar's button works.
8. **On the deployed site**, after the merge: Twitch accepts the real domain in the window.
9. Opening the window from inside fullscreen (the control sits in the dock row that goes fullscreen).
10. After shrinking the window until Twitch pauses, does enlarging it resume playback by itself?
