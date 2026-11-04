# Chat Placement — Design

**Status:** Decisions complete (the open questions were answered by the owner on
2026-11-04). Ready for an implementation plan.
**Date:** 2026-11-04
**Owner decisions:** see "Decided" (their words, paraphrased).

---

## Intent

Chat is where the community is, and the viewer wants control over where it sits
next to the video: out of the way when they want the picture, docked on the side they
like, and in a window of its own that they size and place themselves (a second
monitor, or on top of the picture). Today the chat is a fixed iframe beside the
player with a draggable split (`prism_panel_ratio`, clamped 0.5–0.92), so it can
never be hidden or moved.

Longer term the chat panel should be able to show chat from other platforms
(Kick, YouTube) and eventually a combined feed. That is **out of scope here**, but
this design must not make it harder.

## Decided (by the owner)

2026-11-03:

- **A** docked with a hide button, **B** snap to a side (remembered for next time),
  and a pop-out window are wanted.
- The pop-out is **built last**. It ships as a plain pop-out of the streamer's own
  Twitch chat. A combined chat window is held for later, with the multi-platform work.
- Design seam: one chat panel, where it lives kept separate from what is in it.

2026-11-04:

- **The viewer sizes and places the floating chat.** If doing that inside the page is
  a technical problem, **pop out to a new child window the viewer manages**. It is a
  technical problem (next section), so there is no in-page floating window: the
  original placement C (drag/resize/corner-snap over the page) is dropped and its job
  goes to the child window.
- **The pop-out follows the channel being watched:** yes.
- **The pop-out is a PRISM-owned page** (`/chat/:channel`): yes. If that proves too
  complex, the plain Twitch chat URL is acceptable.
- **Hide/show is remembered across sessions:** yes.
- **No bottom dock.** Chat is tall and narrow, so docked along the bottom it would
  stretch across the page and leave dead space. Left and right only; revisit only if
  it is wanted later.
- **Snapping: try visible drop zones first.** If drawing and showing/hiding the zones
  proves too much, plain snapping is fine.

## The constraint behind that decision: nothing may sit over the embed

Twitch disables embed autoplay when its visibility check fails. The player bundle
makes that check literally `IntersectionObserver` v2 `isVisible === false` on the
embed iframe, and **any element drawn over the iframe fails it**. This was measured
in the owner's Chrome on 2026-11-04: hiding only a 28px debug button that overlapped
the player flipped `isVisible` to true, and Twitch started playback at that moment.
The Twitch Developer Services Agreement says the same in prose (verified on the
live page, 2026-11-04): autoplay may be disabled when the embed is "hidden, obscured,
or located at the bottom of a page", and embeds must not be obscured by other page
elements. The debug gear that caused this was moved out of the player in PR #52, and
the channel rail now reserves its own strip on player pages (PR #51) for the same reason.

| Placement | Overlaps the player in the page? | Verdict |
|---|---|---|
| A docked, with hide | No (player resizes) | Fine |
| B docked left or right | No (player resizes) | Fine |
| ~~C floating in the page~~ | Yes, by definition | **Dropped**, replaced by D |
| D child-window pop-out | No (it is not part of the page) | Fine, and now also the "float" |

A separate window is not painted by the page, so the page's visibility check cannot
see it. That is expected, not yet measured; the acceptance run below confirms it.

## Behaviour

- A **hide/show** control collapses the chat so the video takes the full width, with a
  small edge tab to bring it back. The state is remembered across sessions.
- **Dock side**: the chat is docked on the left or the right of the video (default:
  right, as today). The side is remembered. On narrow screens the current stacked
  layout stays and placement controls are hidden (my guess).
- **Pop out**: a button opens the chat in a **new browser window**. The viewer sizes and
  moves it with the operating system like any other window, including onto a second
  monitor or over the video. While it is open, the in-page chat is hidden and the
  video takes the width. Closing the window puts the chat back where it was docked.
  - It must be opened from the click itself, or popup blockers refuse it. If
    `window.open` returns null, show a short notice and stay docked.
  - It opens at the last size and position the viewer left it in (see below).
  - It follows the channel being watched: navigating to another channel in the main
    window changes the pop-out's chat.

### Moving the dock: drop zones, with plain snapping as the fallback

Two ways to change sides, from most to least certain:

1. **A move button** in the chat header swaps the side. It always works, with keyboard
   and touch, and is built first.
2. **Dragging** the chat by a header handle onto the other side. Use the browser's
   native drag and drop, so the thing following the cursor is drawn by the browser and
   not by the page. A panel dragged across the video by the page itself would sit over
   the embed.

For dragging there are two levels, and the owner picked the order:

- **Drop zones (try first).** While a drag is in progress the two docking targets are
  shown, and they disappear on drop or cancel. This is the owner's preference. The
  catch is that a zone is an element, and a zone drawn over the video sits over the
  embed. A spike decides how they are drawn (below): over the half of the page they
  dock to if a transient overlay on a *playing* embed is harmless, otherwise as a
  highlight along the page edge, outside the player.
- **Plain snapping (the accepted fallback).** No zones. On release the chat docks to
  whichever half of the page the cursor is in. If drawing, showing and hiding the
  zones turns out to be more than a small amount of work, ship this.

### What the pop-out window contains

A **PRISM-owned page** (`/chat/:channel`, no header, rail, rain or panels) that renders
the same `ChatSource` as the docked chat. Reasons:

- The pop-out is then the same platform-agnostic panel in another window, so Kick,
  YouTube and the later combined feed need no new window design.
- It is same-origin with the main window, so PRISM can remember the window's size and
  position and talk to it (below). A bare `twitch.tv` pop-out URL cannot do either.

Fallback if that page proves too complex (the owner is fine with this): open the
streamer's Twitch chat URL directly (`https://www.twitch.tv/popout/<channel>/chat?popout=`;
UNVERIFIED, check before building). It works, but PRISM can then neither remember the
window's geometry nor follow channel changes.

- **Remembering size and position:** the pop-out page records `outerWidth`,
  `outerHeight`, `screenX` and `screenY` on resize and on `pagehide` (there is no move
  event, so also sample on an interval while open) under a new `STORAGE_KEYS` entry,
  and the opener passes them as `window.open` features. Open risk: the saved monitor
  may be gone; browsers generally clamp, but that is unverified.
- **Talking to the main window:** a `BroadcastChannel`, which does not depend on
  `window.opener`. The pop-out announces itself, says when it closes, and receives
  channel changes. If the main page reloads while the pop-out is open, the main page
  asks "is a pop-out alive?" on load and the pop-out answers, so placement does not
  get stuck on `popped-out` or on docked.
- **Do not open it with `noopener`.** It is PRISM's own page, so there is nothing to
  protect, and `noopener` makes `window.open` return `null`, which would be
  indistinguishable from a blocked popup and would lose the handle used to notice a
  closed window (`popup.closed`, checked alongside the close message).

### Optional later: Document Picture-in-Picture

Chromium has a Document Picture-in-Picture API: a small always-on-top window the viewer
can resize and place, hosting page content. It would give the "chat floating over the
picture" feel without touching the page. It is Chromium-only and needs its own
iframe, so it is **not** part of this work; noted so it is not forgotten.

## Architecture

- `ChatDock`: owns placement state and layout. Placement is a small union
  (`docked-right | docked-left | hidden | popped-out`), persisted under a new
  `STORAGE_KEYS` entry, following the existing `prism_rail_position` precedent.
  `hidden` and `popped-out` each remember which side to return to.
- `ChatSource`: the content component. Today it is the existing `TwitchChatEmbed`
  iframe; later it can be YouTube, Kick, or a combined feed without touching
  `ChatDock` or the pop-out.
- `ChatPopoutPage` (`/chat/:channel`): renders only `ChatSource`, records its own
  geometry, and speaks on the `BroadcastChannel`. It is mounted outside `AppLayout`
  so it carries none of the page chrome.
- `useChatPopout`: opens the window from a click, tracks whether it is open, and
  handles blocked popups, close, reload recovery and channel following.
- `TwitchPlayerPage` swaps its fixed flex row for `ChatDock` around the player.
  The existing resizable split remains for the docked modes.

## Build order

1. `ChatDock` with docked-right, hide/show and persistence (A).
2. Dock side: the header move button, then drag with plain snapping, then drop zones if
   the spike says they are affordable (B).
3. The pop-out: first the PRISM-owned page, falling back to the Twitch URL if that is
   too complex (D). Combined chat comes later with the multi-platform work.

## Spikes (cheap experiments, run before the part that depends on them)

1. **Does a transient overlay on a playing embed make Twitch pause, or only refuse to
   start?** Float a box over a *playing* embed in the owner's Chrome and watch. This
   decides how drop zones may be drawn. If it pauses, zones must stay out of the
   player, or the work falls back to plain snapping.
2. **Does the Twitch chat embed render inside a PRISM-owned popup window?** (parent is
   our host, and `localhost` in development.) Expected yes: the docked chat is the same
   embed. If it does not, use the Twitch pop-out URL.
3. **Does a saved window position survive a monitor that is no longer there?**
   Unverified; the owner has several monitors.

## Non-goals

- Combined or multi-platform chat, and sending messages from PRISM.
- YouTube or Kick chat (those wait on the platform-adapter work).
- An in-page floating window, and Document Picture-in-Picture (see above).
- A bottom dock.
- Redesigning the mobile layout.

## Acceptance (this is where unit tests are not enough)

- Unit tests: placement reducer and persistence, hide/show, switching sides, popped-out
  state and returning to the previous side, blocked popup stays docked, geometry saved
  and restored (with `window.open` mocked), and channel following.
- Real browser, in the owner's foreground Chrome: for each docked placement, autoplay
  still starts and `isVisible` stays true. While a drag is in progress with drop zones
  shown, a playing embed keeps playing. With the pop-out open and placed **over the
  video**, autoplay still starts too (this is the check that confirms a separate window
  is invisible to Twitch's test). The measurement script used on 2026-11-04 (an
  `IntersectionObserver` with `trackVisibility`, read on the embed iframe) is the
  oracle; it is not a unit-testable property.
- Opening the pop-out, closing it, and reloading the main page while it is open each
  leave the chat in a sensible place.
