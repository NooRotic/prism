# YouTube chat pop-out beside Twitch chat (short design)

Goal set by the owner 2026-11-22; approach A picked.

## Why

The owner watches a streamer who is live on Twitch and YouTube at once (a pair from Linked accounts), with the Twitch
stream on the Twitch channel page and **both chats popped out**, each in its own window.

## Goals

1. **A "Pop out YouTube chat" button** in the chat header (`ChatHeader.tsx`, beside "Pop out chat"), shown only when the
   Twitch channel has a linked YouTube account (`linkedAccounts.ts`, `youtube.channelId`).
2. **Click finds the live video:** the channel's uploads playlist (newest 3) + one `videos.list` (2 units, the same
   trick as `youtubeLive.ts`), reusing the rail's answer when it already lists that channel live (0 units).
3. **The window** is a PRISM route outside the layout (like `ChatPopoutPage`) holding YouTube's own chat embed
   `https://www.youtube.com/live_chat?v=<videoId>&embed_domain=<location.hostname>`. Showing it costs 0 units.
4. **Two windows side by side:** a window name per platform (`prism-chat-twitch`, `prism-chat-youtube`); every bus
   message names its platform, so "switch channel" for one never moves the other. Each remembers its own size and place.
5. **Not live on YouTube:** the button says so ("Not live on YouTube right now") instead of opening an empty window.

## Non-goals / anti-goals

- No API polling for messages, no own chat renderer, no merged Twitch + YouTube feed (needs polling; quota is shared
  by every visitor). No Google write scope; posting relies on the owner's YouTube sign-in inside the embed.
- Never spend units without a click or a page change the owner made.

## Approaches

- **A. YouTube's chat embed in a second pop-out (picked):** 2 units per lookup, 0 while open; posting depends on the
  browser carrying the YouTube sign-in into the embed.
- B. Own chat from `liveChatMessages.list`: rejected, units on every poll, read-only without a write scope.
- C. One merged chat: rejected for now, needs B.

## Calls made by Claude (owner can override)

- When the Twitch page moves to another channel, the YouTube window follows: if the new channel is linked and live it
  switches (one 2-unit lookup, triggered by the owner's navigation); otherwise it shows "<name> isn't live on YouTube"
  with a close button.
- When the YouTube stream ends, the embed's own "chat has ended" view is left as is.

## First thing to verify (on prod, owner signed in to YouTube in Chrome)

Reading works and posting works in the embed. If posting fails, ship reading plus an "Open chat on YouTube" link and
tell the owner; do not work around it.

## Tests

Window names per platform; bus messages scoped by platform; button hidden without a link; "not live" path; rail
answer reused (no API call); lookup cost is exactly 2 calls.
