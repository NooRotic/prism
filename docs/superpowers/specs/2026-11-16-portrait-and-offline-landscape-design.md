# Portrait video box, narrow-window rail, offline-page landscape — design (short)

Status: approved by the owner in chat, 2026-11-16 (the 300px minimum, hiding the rail, and
extending the offline layout). Follows `2026-11-16-landscape-phone-layout-design.md`.

## Intent and why

Three gaps left after the landscape work:

1. **The video is cropped in portrait.** `TwitchEmbedPlayer` forces its host to be at least 300px
   tall (Twitch's documented embed minimum), but the player's box is 16:9 with `overflow-hidden`:
   170px on a phone. Measured at 390x844: a 301x300 iframe in a 170px box, so the lower part of
   the video and its controls are cut off and the chat appears to sit on the video. The same
   happens from 768px up whenever the player column is narrower than 533px.
2. **The follow rail squeezes narrow windows.** It reserves 56px of a 390px phone (the page is
   302px wide). The owner wants it hidden there too.
3. **The offline-channel page gets none of the landscape layout** (the final review's Important
   finding): a signed-in viewer on a channel that is not live plays a recording in a stacked box.

## Goals

- The Twitch video box is never shorter than 300px, at any width, outside fill/fullscreen and
  landscape mode (which size it to the window).
- The rail is hidden, and its gutter freed, below Tailwind's `md` breakpoint on every route.
- On the offline page, with a recording/clip/stream playing on a landscape phone, the video fills the
  window and the chat pushes in beside it, exactly as on the live page.

## Non-goals / anti-goals

- No scaling of the embed (rejected: Twitch's autoplay and visibility checks may not tolerate a
  scaled iframe, and that needs a real device to test).
- The folded offline page (nothing playing) stays the ordinary scrolling page in landscape: there
  is no video to give the screen to.
- Never remount the player on rotation (a recording would restart); never draw anything over the
  video; landscape mode never writes saved settings.

## Approaches (offline page)

1. **Restyle `OfflineLayout` in place (chosen).** The player keeps its position in the tree, so a
   recording does not restart when the phone rotates; the chat stays one element.
2. Render `ChatDock` for the offline page while sideways. Rejected: the player would remount.

## Design

- Portrait box: `min-h-[300px]` on the player wrappers of `ChatDock` (cleared in fill mode and
  landscape) and `OfflineLayout`.
- Rail: a second `@media (width < theme(--breakpoint-md))` block hides `.narrow-hide` (a class on
  the rail) and zeroes both rail reserve variables with `!important`. It uses the theme breakpoint,
  not a pixel width, so it moves with the `md:` classes (same reason as the fill-hide rule).
- Shared pieces: the landscape chat column classes move out of `ChatDock` into a small module, and
  the `data-fill` root attribute effect becomes a `useFillScope(scope)` hook, so `OfflineLayout`
  and `ChatDock` use one implementation.
- `OfflineLayout` while `sideways = landscape && player !== null && !floating`: the root is a
  `fixed inset-0` flex row with `data-fill="all"` forced; the strip and body are hidden (still
  mounted); the player is `flex-1`, full height, not 16:9; a `LandscapeChatHandle` column sits
  before the chat cell; the chat cell takes the landscape width classes (closed: 0px, invisible,
  `aria-hidden`; open: the same capped width, so the video keeps 400px) and its inner panel fills
  it. Chat open state is local and not persisted; the saved `hidden` and widths are untouched; the
  width and height resize handles are hidden; popped out, the handle says "Return chat to the
  page".

## Left to the builder

Exact class strings for the sideways variants; how the existing `OfflineLayout` tests are extended;
the browser check at 844x390 (offline channel, recording playing) and 390x844 / 800x600 for the
300px box and the rail.
