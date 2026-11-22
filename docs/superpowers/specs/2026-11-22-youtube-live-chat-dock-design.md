# YouTube live chat on the player page (short design)

Owner request 2026-11-22; approach A (the Twitch page's chat dock) picked by the owner.

## Why

The owner watches YouTube live streams on `/youtube/<videoId>` (e.g. `A-fW7Vu9Sfc`) and wants the chat there. Steps, in
the owner's order: (1) see the chat, (2) post in it, (3) the Twitch–YouTube link UI on this page, later.

## Goals

1. **When the video is live, the player page shows its chat in the same dock the Twitch page uses** (`ChatDock`): chat
   beside the video, swap side, hide/show, text size, fill mode, fullscreen, pop out, the landscape-phone slide-in.
2. **The chat is YouTube's own embed** (`ChatSource kind="youtube"`, target `v:<videoId>@<channelId>`), so posting
   (step 2) works when the viewer is signed in to YouTube in that browser. No extra build for step 2 unless the owner's
   test shows posting fails.
3. **Pop out** from this dock opens the existing YouTube chat window (`useChatPopout(..., 'youtube')`, route
   `/chat-youtube/:target`).
4. **Not live (ended, upcoming, an ordinary video, or details unavailable): the page is exactly as today.**

## Non-goals / anti-goals

- No Twitch link UI on this page yet (step 3), and no "Pop out YouTube chat" linked-streamer button here.
- No extra API units: "is it live" comes from `getVideoPage`'s existing call (`data.live.state`).
- The player must never restart because the chat appeared (a remount restarts the video).

## Approaches

- **A. Reuse `ChatDock` with a `kind` (picked):** one dock for both platforms; the work is passing `kind` through and
  checking each Twitch-only rule.
- B. A plain chat column on the YouTube page: quicker, but none of the controls, and the two pages would differ.

## Calls made by Claude (owner can override)

- **The layout is decided before the player mounts.** The page waits for the video details (cached for ordinary
  videos, one call for live ones) before mounting the player, then mounts it either bare or inside the dock, so the
  player never moves in the tree and never restarts. While waiting it shows the existing "Loading video..." box.
- **A live page uses the Twitch page's width** (the dock's own `max-w-[1600px]` row); the page's narrow column
  (`max-w-5xl`) would squeeze the video beside the chat. Everything below the player keeps today's width.
- **One chat placement for both platforms:** hiding chat or moving it to the left on Twitch does the same on YouTube
  (the saved placement is shared).
- **The dock header's video pop-out control replaces `VideoPopoutBar` while the dock is shown**, as on the Twitch page.
- **Twitch's size floors stay** (video at least 300px tall, at least 400px wide beside an open chat): harmless for
  YouTube's player, and one rule set is simpler.
- `ChatDock`'s `useYoutubeChatPopout` (the linked-streamer button) only runs for `kind="twitch"`.

## Tests

The dock appears for a live video and not for `none` / `upcoming` / unavailable; the chat frame's target is
`v:<id>@<channelId>`; pop-out uses the YouTube window name and route; the player mounts once (not before the details
and not again after); no linked-streamer button on the YouTube page; Twitch page behaviour unchanged.

## Left to the builder

How `ChatDock` takes the chat target and kind (props), and where the width switch lives.
