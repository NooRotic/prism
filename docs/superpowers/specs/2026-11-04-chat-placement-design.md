# Chat Placement — Design (DRAFT)

**Status:** Draft, not approved. Written while the owner was away from the keyboard
from decisions already made in the brainstorm; one decision below blocks the rest.
**Date:** 2026-11-04
**Owner decisions so far:** see "Decided" (their words, paraphrased).

---

## Intent

Chat is where the community is, and the viewer wants control over where it sits
next to the video: out of the way when they want the picture, snapped where they
like it, floating when they want it, and in its own window on a second monitor.
Today the chat is a fixed iframe beside the player with a draggable split
(`prism_panel_ratio`, clamped 0.5–0.92), so it can never be hidden or moved.

Longer term the chat panel should be able to show chat from other platforms
(Kick, YouTube) and eventually a combined feed. That is **out of scope here**, but
this design must not make it harder.

## Decided (by the owner, 2026-11-03)

- All four placements are wanted: **A** docked with a hide button, **B** snap to the
  left, right or bottom (remembered for next time), **C** a floating window you can
  drag and resize that clicks into corners, **D** pop out to its own browser window.
- **D is built last.** It ships as a plain pop-out of the streamer's own Twitch chat.
  A combined chat window is held for later, with the multi-platform work.
- Design seam: one chat panel, where it lives kept separate from what is in it.

## Constraint discovered since (blocks placement C): nothing may sit over the embed

Twitch disables embed autoplay when its visibility check fails. The player bundle
makes that check literally `IntersectionObserver` v2 `isVisible === false` on the
embed iframe, and **any element drawn over the iframe fails it**. This was measured
in the owner's Chrome on 2026-11-04: hiding only a 28px debug button that overlapped
the player flipped `isVisible` to true, and Twitch started playback at that moment.
The Twitch Developer Services Agreement says the same in prose (verified on the
live page, 2026-11-04): autoplay may be disabled when the embed is "hidden, obscured,
or located at the bottom of a page", and embeds must not be obscured by other page
elements. The debug gear that caused this was moved out of the player in PR #52.

Consequence for the placements:

| Placement | Overlaps the player? | Verdict |
|---|---|---|
| A docked, with hide | No (player resizes) | Fine |
| B snapped left/right/bottom | No (player resizes) | Fine |
| C floating over the video | **Yes, by definition** | **Conflicts**, needs a decision |
| D separate window | No | Fine |

### Decision needed on C (pick one)

1. **Confine the floating window to the page area outside the player rectangle.**
   Keeps autoplay and Twitch's rules intact; less freedom than the mock showed.
   (My recommendation.)
2. **Allow it over the video and accept the risk.** Needs one cheap experiment
   first: float a box over a *playing* embed in the owner's Chrome and see whether
   Twitch pauses or only refuses to *start*. I can script this. Even if it keeps
   playing, it still sits against the agreement's "must not be obscured" wording.
3. **Drop floating-over-video.** Treat "float" as the detached window (D) only.

## Behaviour (assuming option 1; my guesses are marked)

- A **hide/show** control collapses the chat so the video takes the full width, with a
  small edge tab to bring it back. State persists across navigation (my guess:
  persisted, not per session).
- **Snap**: dragging a docked chat to the left, right or bottom edge re-docks it
  there; the choice is remembered. On narrow screens the current stacked layout
  stays and placement controls are hidden (my guess).
- **Float** (option 1): draggable and resizable, constrained so it never intersects
  the player's rectangle; it snaps to the free corners of the allowed area.
- **Pop out** (D): opens the streamer's Twitch chat in a separate window
  (Twitch's pop-out chat URL form, `https://www.twitch.tv/popout/<channel>/chat?popout=`;
  UNVERIFIED, check before building). The in-page chat is hidden while popped out.

## Architecture

- `ChatDock`: owns placement state and layout. Placement is a small union
  (`docked-right | docked-left | docked-bottom | floating | hidden | popped-out`),
  persisted under a new `STORAGE_KEYS` entry, following the existing
  `prism_rail_position` precedent.
- `ChatSource`: the content component. Today it is the existing `TwitchChatEmbed`
  iframe; later it can be YouTube, Kick, or a combined feed without touching
  `ChatDock`.
- `TwitchPlayerPage` swaps its fixed flex row for `ChatDock` around the player.
  The existing resizable split remains for the docked left/right modes.

## Non-goals

- Combined or multi-platform chat, and sending messages from PRISM.
- YouTube or Kick chat (those wait on the platform-adapter work).
- Redesigning the mobile layout.

## Acceptance (this is where unit tests are not enough)

- Unit tests: placement reducer and persistence, hide/show, snap, popped-out state,
  and "floating never intersects the player rect" (pure geometry).
- Real browser, per placement, in the owner's foreground Chrome: autoplay still starts
  and `isVisible` stays true. The measurement script used on 2026-11-04 (an
  `IntersectionObserver` with `trackVisibility`, read on the embed iframe) is the
  oracle; it is not a unit-testable property.

## Open questions

1. Decision on C above.
2. Is hide/show persisted across sessions, or reset on reload?
3. When docked bottom, how tall by default, and is it resizable like the side split?
4. Should snapping use screen edges or visible dock zones while dragging?
