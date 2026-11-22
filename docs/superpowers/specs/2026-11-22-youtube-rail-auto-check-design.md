# YouTube rail: automatic first check + live pick-up (short design)

Approved by the owner 2026-11-22.

## Why

The rail's YouTube section only knows who is live after the owner presses "Check live". The owner wants it to know on
arrival, and to stay honest between checks without spending more checks.

## Goals

1. **First check is automatic, once per visit.** A visit is a new tab or window (owner picked option A over "once a day").
   A reload of the same tab is not a new visit: a per-tab `sessionStorage` marker. The automatic check obeys the existing
   allowance (1 per hour, 5 per rolling 24 h) and counts as one of the five. If the allowance says no, it simply doesn't
   run; the last answer stays shown with its age.
2. **Every later check is the button**, exactly as today.
3. **Opening a live video adds it.** The YouTube player page's existing `videos.list` call adds `liveStreamingDetails` to
   its `part` (same 1 unit). If `snippet.liveBroadcastContent === 'live'` and the channel is one of the saved
   subscriptions, the stream is upserted into the rail's stored last answer (`LOCAL_YOUTUBE_LIVE_LAST`) with its viewer
   count and start time.
4. **Opening an ended stream drops it** from the stored answer (owner accepted this addition).

## Non-goals / anti-goals

- No timers or background polling: the shared 10,000-unit daily quota (key is public) must only be spent on arrival or
  on a click.
- Never add a channel the owner is not subscribed to.
- Upserting from the player page does not reset `checkedAt` (it was not a check) and does not use a check.

## Approaches

- **Extend the existing hook and store (picked).** `useYoutubeLive` gains the once-per-visit automatic check; a small
  pure function upserts / removes one stream in the stored answer; the rail re-reads the store (same tab: an event or
  shared state; other tabs: `storage` events).
- Server-side live tracking: rejected, the backend quota work is P2 until PRISM has users.
- A separate "seen live" list beside the check results: rejected, two lists for one question.

## Tests

- A reload in the same tab makes no second automatic check.
- The automatic check respects the hourly and daily allowance and is counted.
- Opening a live subscribed video adds / refreshes it; an ended one is removed; an unsubscribed live channel is never added.
- The rail updates without a reload when the player page changes the store.

## Left to the builder

How the rail learns of a same-tab store change (custom event vs. context), and exact module names.
