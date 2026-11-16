# Landscape phone layout — design (short)

Status: approach and assumptions approved by the owner in chat, 2026-11-16.

## Intent and why

On a phone held sideways the Twitch player page is unusable. The page switches layout on
width (Tailwind `md`, 768px), but a landscape phone is 670–930px wide and only 375–430px
tall: below 768px the player and chat stack and the video is taller than the screen; from
768px up the desktop row appears with a 56px header and a 56px rail eating the little height
there is. The owner wants landscape to show the video full screen, with the chat available
on demand, and the follow rail out of the way.

## Goals

- In landscape on a phone, the player page is the video filling the screen, nothing else.
- The chat slides in and out beside the video on a tap (and a swipe on its handle).
- The follow rail is hidden in that state.
- Rotating back to portrait restores today's layout untouched.

## Non-goals / anti-goals

- No change to portrait, tablets, or desktop behaviour or to their saved settings.
- Nothing is ever drawn over the video. Twitch pauses an embed that anything covers (the
  rail's own comments record this); a layout that covers it is a failure even if it looks good.
- Rotating must not restart the stream (the player must keep its place in the tree).
- No orientation locking, no new settings screen.

## Constraints

- "Landscape phone" is detected by media query on **height**, not width:
  `(orientation: landscape) and (max-height: 500px)`. Width cannot tell a phone from a
  small desktop window.
- Reuse fill mode (`data-fill`, `fill-hide`, `fixed inset-0` row): it already hides the
  header, rail, slide-down panels, page body and rain while keeping them mounted.
- The chat's saved placement (`hidden`, `side`) and the saved fill setting are the
  desktop's; landscape phone mode must neither read them as its own nor overwrite them.
- Chat visibility in this mode is runtime state, default closed, not persisted.

## Approaches considered

1. **Push (chosen).** The chat opens as a column beside the video (about 38% of the width,
   with a floor so it stays readable); the video narrows to make room. No overlay, so the
   embed is never covered. Cost: the video resizes when the chat opens.
2. **Overlay.** Chat floats over the video edge; the video keeps its size. Rejected: risks
   Twitch pausing the embed, and fixing that would need its own investigation.
3. **Reuse the stacked mobile layout.** Rejected: the video would be taller than the screen.

## Design

- A `useLandscapePhone()` hook reads the media query (and follows changes).
- `ChatDock`: when it is true, the fill scope is forced to `all` regardless of saved fill,
  and chat visibility comes from a local `landscapeChatOpen` (default false), not from the
  saved `hidden` flag. The player wrapper stays the first child so a rotation does not
  remount it. The chat panel stays mounted and animates its width (slide), so opening it
  again does not reload the iframe or lose the scroll.
- A slim always-visible handle column beside the video (not over it) toggles the chat; a
  horizontal swipe on the handle does the same. It sits on the chat's saved side.
- The rail gets a "hide in landscape phone" rule (a CSS class keyed to the same media
  query), so it is gone on every route in that state, not only on the player page. The
  Following panel in the header remains the way to reach follows (in portrait).
- With the header hidden there is no in-page navigation in landscape; rotating back to
  portrait is the way out. (Owner's assumption accepted; revisit if it annoys.)

## Left to the builder

- Exact chat width, transition timing, handle size (touch target at least 44px).
- Whether the existing `ChatHeader` is trimmed in this mode (its dock/resize controls make
  no sense in a push column).
- How the media query is mocked in tests (`matchMedia` in jsdom).
- Verify at 844x390 and 667x375 in the browser pane; the Twitch embed itself may not
  autoplay there, so layout is checked separately from playback.
