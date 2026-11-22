# YouTube settle point (short design)

Owner request 2026-11-22 ("3+4 to get us to a settle point"); design approved the same day.

## Goals
1. **Muted notice for YouTube.** When the browser forced the YouTube player to start muted (no click on the page yet, or
   sound autoplay refused), a pill inside the player, bottom left: "Playing muted · Turn sound on". The click unmutes
   (and is the page interaction the browser wants). Hidden when the viewer muted it themselves. Inside the player, so
   the page, the live chat dock and the pop-out window all get it.
2. **Blocked YouTube chat pop-out** shows "Pop-up blocked. Allow pop-ups for this site to use the chat window." (as the
   Twitch one does) in `ChatDock` and `OfflineLayout`, and spends no lookup when the window did not open.
   `useChatPopout().open` returns whether the window opened.
3. **The dock's video pop-out on a YouTube page continues from the playhead** (`currentYoutubeTime()`), as
   `VideoPopoutBar` does.
4. **Link boxes keep focus**: one shared hook for `LinkAccountsModal` and `LinkTwitchModal`: Tab and Shift+Tab cycle
   inside the dialog, Esc closes from anywhere, focus returns to the opener on close.
5. **An invalid Twitch name** (Twitch answers 400) reads "No Twitch channel found for that name."

## Non-goals
Twitch's own muted notice; any change to how YouTube decides to start muted.

## Approaches
One sensible way each. For 1, inside the player (picked, Claude's call) beats a bar beside it on the page, which the
dock and pop-out window would not get.

## As built
- **Goal 3 dropped after review:** the chat dock appears only for live videos, and a live stream's "current time" is
  the elapsed time, so passing it would start the pop-out a few seconds behind live. The dock's pop-out opens at the
  live edge, as before; `VideoPopoutBar` (ordinary videos) keeps carrying the playhead.
- The muted pill also steps aside while paused or ended; Esc during IME composition is left to the input method; the
  Twitch-side "Link accounts" box no longer saves when closed mid-check.
