# Fill Mode (PRISM-VIEW) — Design

**Status:** Approved by the owner and implemented on `feat/fill-mode` (not pushed); the checks in
the owner's Chrome are still to do (see "Implementation status"). A fresh reviewer read it as the
builder first; its answers are folded in as numbered calls below. Builds on `ChatDock`, which is
in PR #55 (not yet merged).
**Date:** 2026-11-04

---

## Intent

The owner watches streams with the video as large as possible and the chat beside it, and flips
between two ways of doing that. On Twitch itself, with a browser extension (BTTV or 7TV) they
keep chat on the left and switch between **theater mode** (video as big as Twitch's page allows,
chat still beside it) and **fullscreen** (video takes the whole screen and covers the chat,
unless the chat is popped out into a window of its own).

In PRISM today the video sits in a page with a header, a rail, panels and sections below it. The
owner's workaround is two tiled Chrome windows (the video filling one, the chat pop-out in the
other) plus an extension that keeps Twitch's fullscreen inside the window.

**Fill mode is PRISM's version of theater mode:** the video and the chat fill the browser
window with everything else out of the way, chat docked on the side the owner picks with a bar
they drag to resize. A second button, **fullscreen both**, takes video and chat fullscreen
*together*, so chat is never covered. Chat text size gets its own controls, because in this
layout the owner is reading chat at a distance.

## Decided by the owner (2026-11-04)

- Fill mode is the theater-mode equivalent: video and chat fill the window, chat docked left or
  right, resizable, flipped in and out like theater mode. ("Correct.")
- It **remembers** the layout for when they come back. ("Yes.")
- **Fullscreen both**, video and chat together, is wanted. ("WOW YES, that'd be GREAT.")
- The chat pop-out stays, for when they want chat in a second window. ("Correct.")
- **Chat text-size controls** belong in fill mode. ("Would be great.")
- While chat is popped out, the **text-size buttons live in the pop-out window itself**, as a slim
  strip with smaller, larger and reset. ("In the pop-out.")
- Earlier decisions still stand: no bottom dock, chat placement as built in PR #55.

## My calls (the owner has not seen these; they are open to change)

1. **Nothing else stays within reach in fill mode.** The owner did not say what they want to keep
   at hand, so: only video and chat. The controls live in the chat header and in the strip beside
   the player. The page header, rail, slide-down panels and everything below the player row are hidden.
2. **Fill mode on or off is remembered too**, not only the layout, so returning lands where they left.
3. **Fill and normal mode share one layout:** the same dock side and the same bar position.
4. **Fill mode applies at `md` (768px) and wider, or at any width when chat is hidden or popped
   out.** With chat docked below `md` the stacked layout stays and fill is ignored. With no docked
   chat there is no layout to conflict, and the strip beside the player is always there, so a
   remembered "on" can never strand a window. This also lets a narrow video-only window, tiled
   beside the pop-out, fill.
5. **Esc leaves fill mode** (best effort, see constraints), and shortcut keys are left to the builder.
6. **Text-size controls live in the chat header in both modes**, since the header exists in both.
7. **Text size uses `transform: scale()`, not CSS `zoom`**, in steps of roughly 70% to 200%.
8. **Fullscreen both is requested on the dock row** (video and chat), never on the Twitch iframe.
9. **Fullscreen both works from normal mode too.** While fullscreen it uses the fill layout through
   a flag that is *not* saved, so it never changes the remembered fill setting. Esc leaves
   fullscreen and lands back in the mode the owner started in (one Esc, not two).
10. **Text size is a separable slice.** The scaled chat is proven first in the owner's Chrome (the
    spike) and built last. If that check fails, fill mode and fullscreen both still ship without it.
11. **The focus rule covers the new controls only** (fill, fullscreen, text size). The four older
    dock transitions (hide, show, pop out, return) that drop focus to the page body stay a known,
    deferred gap from the chat-placement review.
12. **Fill applies only on the Twitch player page** (`/twitch/:channel`, where the dock lives). A
    remembered "on" is ignored on the hub, protocol pages and the YouTube and HLS pages, which
    have no exit button.
13. **Text size in the main window applies at `md` and wider**, where the header controls exist, so
    a remembered 200% can never be stuck on a narrow window. The pop-out always applies the saved size.
14. **The pop-out follows text size through the browser's `storage` event** on the saved-size key,
    not the owner-scoped message bus, so a size is a plain global preference that any window follows.
15. **Everything outside the dock row is hidden the same way**, including the profile, stats, debug
    and clips/VODs sections, not just the header, rail and panels. Hidden, not unmounted.
16. **No animation on the player wrapper's size or position when flipping,** and nothing present
    over it during the flip. The earlier experiment on whether a transient overlay is safe on a
    playing embed was never run.
17. **Hiding chat is one shared setting.** Hiding it in fill mode also hides it in normal mode,
    because both share one saved layout.
18. **The saved-ratio storage access is wrapped in try/catch** while this work touches that key
    (closing a gap carried over from the chat-placement review).

## Goals

- A one-click way into and out of a window-filling view, with the stream **not restarting** when
  flipping.
- Chat docked left or right in that view, resized by the existing bar, hideable, poppable.
- Fullscreen both, with Esc leaving it.
- Chat text bigger or smaller, remembered.
- Autoplay and the no-overlay rule behave exactly as they do now.

## Non-goals

- A **video pop-out window** (a chrome-less `/view/<channel>` window to tile next to the chat
  pop-out). The next step after this one.
- Restyling anything Twitch draws *inside* its player or chat.
- Replacing Twitch's chat with our own renderer, or chat theming (contrast, light or dark flips).
- A bottom dock, and any change to the mobile layout.
- Intercepting Twitch's own fullscreen button, which is inside a cross-origin iframe.

## Anti-goals (a failure even if it technically works)

- Anything drawn over the Twitch embed, or any change that makes Twitch refuse to autoplay.
- Flipping modes reloads or rebuffers the stream.
- A mode you cannot leave, in any state of chat (docked, hidden, popped out).
- Needing the Volume Meter extension, or breaking when it is on.
- Hiding the chat input.

## Constraints (hard rules, each learned the hard way)

- **The player node never moves.** Entering fill mode is a CSS class change on the existing
  elements, never a portal or re-parent; moving an iframe in the DOM reloads it. Changing the dock
  side already works this way, and this must too.
- **Nothing over the embed.** Twitch disables autoplay when anything covers its iframe (measured: a
  28px button was enough), and its agreement says embeds must not be obscured. The fill container's
  backdrop sits *behind* the player. Hidden chrome (header z-40, panels z-30, rail z-25) must be
  hidden, not merely lowered, or it paints over the video. Controls sit beside the player.
- **Always a way out.** Visible buttons for "exit fill mode" exist whether chat is docked, hidden
  or popped out. Esc is best effort only: when focus is inside the chat iframe the page never sees
  the key.
- **Hide, do not unmount,** the header, rail, panels and rain canvas, so auth, rail state and
  hooks are not reset when flipping.
- **Text size scales the iframe from outside:** `transform: scale(s)` with the box sized to `1/s`
  of its container so it still fits. Never `zoom`: measured, it produced a box that overflowed.
- **Fullscreen** uses the Fullscreen API on the dock row, from a click, in both modes. Handle a
  browser without it (hide the button), a rejected request, and the user leaving with Esc (sync on
  `fullscreenchange`). Sync only when `document.fullscreenElement` is the dock row, not on
  "anything is fullscreen", or Twitch's own fullscreen button would flip our state. While
  fullscreen, Esc exits fullscreen first, and that is the only Esc needed.
- **State** goes through `STORAGE_KEYS` with try/catch, parsed defensively like the existing
  placement (garbage means the default).
- **Accessibility:** every control is a real, labelled button with a visible focus state, and
  focus moves to the matching control after the new toggles instead of falling to the page body.
- **No animation** on the player wrapper's size or position when flipping modes.
- **The Volume Meter extension is owner-run acceptance only.** It is not described anywhere in the
  repo and may inject nodes, so no selector may assume what else is a child of `body` or of the
  player's parent.

## Behaviour

**Flipping.** A button in the chat header (and the strip beside the player when chat is hidden or
popped out) toggles fill mode. The dock row becomes the whole window; the page behind is hidden.
The player wrapper drops its 16:9 box and fills the remaining width, and Twitch letterboxes the
picture itself, as the owner's current setup does. The existing resize bar, side swap, hide and
pop-out work unchanged.

**Controls by state.**

| Chat state | Where the controls are |
|---|---|
| Docked | Chat header: fill, fullscreen both, text size, side, pop out, hide |
| Hidden or popped out | The strip beside the player: restore or return chat, fill, fullscreen both |
| Popped out (in the pop-out window) | A slim strip in that window: text size smaller, larger and reset |

**Fullscreen both.** Fullscreens the dock row, so the video and the docked chat go fullscreen
together. If chat is hidden or popped out, it is the video alone. Twitch's own fullscreen button
keeps working and still fullscreens the video only.

**Text size.** Smaller and larger buttons (and a way to reset), remembered as a number. It scales
the chat iframe only, never the strip that carries the buttons. The pop-out window has its own slim
strip with the same three buttons (decided by the owner), so the size can be changed where the chat
is being read. Every window shows the saved size and follows a change made in any other (see my
call 14). The browser's own zoom is no substitute, because it is per site and would resize PRISM's
other window too. The pop-out still shows nothing but the chat and this strip: no PRISM chrome.

**Persistence.** Fill on or off, and the text size, are new; dock side and bar position are the
existing keys. All remembered across visits.

## Architecture (a sketch; the builder decides)

- A small piece of shared state for "fill mode" that both `ChatDock` and the page shell (`AppLayout`)
  can read, persisted, with one source of truth. The shell hides its chrome from it.
- `ChatDock` gains the fill class and the new controls; `ChatHeader` and `ChatTab` carry the buttons.
- A scaled-chat wrapper around `ChatSource`, used by the dock and by the pop-out page, and one
  small text-size control cluster that the chat header and the pop-out strip both use.

## Evidence so far

- Tested in a throwaway page on the real chat embed: `transform: scale()` with a compensated box
  enlarges Twitch's chat text, and the box lands exactly on the viewport; CSS filters also reach
  inside the iframe. The exact scale factor and crispness could not be measured reliably in the
  development browser, so **the fit must be confirmed in the owner's Chrome.**
- The owner's screenshots show the pop-out working in a real Chrome window beside a playing stream.
- Measured in the development browser after building (not the owner's Chrome): at 1440x900 with
  fill on, the dock row is `fixed` and covers the whole window, the player fills the left 80% at
  full height with no 16:9 box, and the header, rail, rain canvas and page sections are `display:
  none`. A narrow window (600px) with chat docked keeps the stacked page; with chat hidden it fills
  and shows a 36px bar of restore, fullscreen and exit-fill. The scaled chat at 150% lands exactly
  on its container (outer, scaled box and iframe all the same size), in the dock and in a 420px
  pop-out, and the strip that holds the buttons is outside the scaled area. This also found and
  fixed an 8px overflow (player + handle + chat was wider than the row) that a full-window row
  would have clipped.
- The owner ran the scaling snippet on a live page; only the console echo came back, so how it
  looked (crisp, typing, clipping) is still unreported.

## Acceptance

Unit tests: the persisted state parsed defensively and saved; the fill class and the hidden
chrome (hidden, not unmounted); **the player node is the same element before and after flipping**;
nothing from the dock inside the player wrapper; scale maths (box size, clamping, steps); the
Fullscreen API mocked (request from a click, exit, `fullscreenchange` sync, unsupported browser,
rejected request); fill ignored below `md`; Esc; focus after a toggle.

In the owner's foreground Chrome: the autoplay oracle (`IntersectionObserver` with
`trackVisibility`, `isVisible` stays true) in fill mode and in fullscreen both; flipping fill on
and off without the stream restarting; chat typing and scrolling at 150% size; changing the size from the pop-out's own strip and seeing
the main window's saved size follow; fullscreen both
showing chat beside the video and Esc leaving it; fill mode in one window tiled next to the
pop-out in another; the Volume Meter extension on and off.

## Left to the builder

Shortcut keys (avoid Alt+F and anything that clashes with Chrome or with typing in chat), the exact
scale steps and labels, icons, how the strip and header arrange their buttons, transitions, and the
names of the state and storage keys.

## Implementation status

Built and unit-tested (the suite stands at 689 tests, build and lint clean): the remembered fill
setting; the fill layout and the hidden page chrome (hide, never unmount); fullscreen of the dock
row, tracked only for that element; fill and fullscreen buttons in the chat header and in a strip
beside the player, with an exit in every chat state, Esc, and focus kept on a toggled button; chat
text size (state, scaled wrapper, header controls, and the pop-out's own strip), all following one
saved size across windows. Nothing in the spec was left out.

Still to do in the owner's foreground Chrome (the development browser has no real popups and cannot
evaluate Twitch's visibility check):

1. The scaling check: text clearly bigger and crisp, nothing clipped, scrolling and typing work.
2. The autoplay oracle (`IntersectionObserver` with `trackVisibility`, `isVisible` stays true) in
   fill mode and in fullscreen both.
3. Flipping fill on and off without the stream restarting.
4. Fullscreen both: chat beside the video, and Esc leaving it; Twitch's own fullscreen button still
   fullscreens the video only and does not flip our state.
5. Text size changed from the pop-out's own strip, with the main window following.
6. Fill mode in one window beside the pop-out in another, and a narrow video-only window filling.
7. The Volume Meter extension on and off.

## Dependencies

`ChatDock`, the hide and dock-side work and the pop-out are in PR #55. This branch is stacked on
it. PRISM squash-merges, so after #55 merges this branch needs `git rebase --onto origin/main
<old #55 tip>` (the playbook is in the project notes).
