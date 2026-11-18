# YouTube "Catch up" — design

Status: DRAFT for the owner's approval (2026-11-18). Nothing beyond the throwaway spike (`spike/youtube-playlist-lab`) is built.

## Intent and why

The owner uses YouTube to catch up on their subscriptions and to pick "what to watch now". Their own description of Watch-now: about **50% new from subscriptions, 25% from Watch Later, 25% related to topics they have watched**. They want to do this inside PRISM so youtube.com is not needed for it.

## Goals

- A **Catch up** page (`/youtube/catchup`) showing one blended queue: lanes **S** (new subscription uploads), **W** (Watch Later), **R** (related), interleaved 2 S : 1 W : 1 R; a dry lane is skipped, duplicates dropped (the spike's `blend()`).
- Play in PRISM's existing YouTube player. Watching in the embed already updates the owner's real YouTube History (confirmed in the lab, signed in).
- Owner-first: built for one signed-in owner; no server, no secrets.

## Non-goals / anti-goals

- No recommendations clone: YouTube has no recommendations API; "related" is a substitute (below).
- Never act as the user server-side (against YouTube terms; already rejected).
- No claim to read Watch History or Watch Later from the API (both return empty since 2016).
- Failure even if it "works": a feed that silently burns the daily API quota, or one that needs re-sign-in every week.

## Constraints (all verified in the lab or earlier)

- The `VITE_YOUTUBE_API_KEY` is already in the browser bundle (10,000 units/day).
- Embed plays public playlists, `UU…` uploads, ad-hoc id lists, and Mix `RD<videoId>`; **`LL`/`WL` do not play** as playlist ids. Embedded "Watch later" button writes to the real list, but PRISM cannot see the click.
- Some videos are not embeddable (`status.embeddable` false; player errors 101/150): drop them from the queue.
- A Mix can give no response and no error: needs an 8s "no response" notice.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| A | Owner pastes channel list once | Simple, but goes stale |
| **B** | **One-time Google sign-in imports subscriptions; feed built from uploads playlists with the API key** | **Chosen by the owner (2026-11-18)** |
| C | IONOS server fetches RSS per channel | Most to build; still needs A or B for the list |

## Design (as decided)

1. **Subscription import (B).** A button "Import my subscriptions" uses Google Identity Services' token client (`google.accounts.oauth2.initTokenClient`, scope `youtube.readonly`). It returns a ~1 hour access token in the browser: no redirect page, no refresh token, no client secret, so Google testing mode's 7-day refresh-token expiry does not apply. The token is used for `subscriptions.list?mine=true` (paged, 50/page), the channel ids are stored (localStorage, `prism_youtube_subscriptions`), and the token is then discarded. Re-import on demand.
2. **S lane.** For each stored channel: uploads playlist id = `UU` + channel id minus `UC`; `playlistItems.list` (1 unit each, newest first), then `videos.list` in batches of 50 for duration and embeddable. Cache results (existing `youtubeCache.ts` pattern, short TTL) so a page visit does not re-spend quota. ~200 channels is ~200 + ~20 units per refresh.
3. **R lane.** Seed = the most recently watched video ids PRISM itself played (kept locally). Load Mix `RD<seed>` in a hidden IFrame player, read `getPlaylist()` (50-100 ids), describe via `videos.list`. 8s no-response notice and fall back to the next seed.
4. **W lane.** Watch Later cannot be read. Route: an "Open Watch Later on YouTube" link plus a paste box (and a bookmarklet that copies the ids from `youtube.com/playlist?list=WL`). The ids are stored locally. With nothing pasted, the lane is empty and the blend carries S and R only.
5. **Blend + view.** The spike's `blend()`; each card carries its lane tag (S / W / R) so the owner sees where it came from; a card clicks through to `/youtube/:videoId`. Exact layout (lanes as filter chips vs. one list) is left to the planner, following existing PRISM card/list patterns.
6. **Dev-only lab stays out of production.** The spike route and files are throwaway; code from them is reused only through this design (the pure helpers in `ytLab.ts` and `ytIframeApi.ts` are the likely candidates).

## Left to the builder

- Google Cloud project, OAuth consent screen in testing mode with the owner as test user, and `VITE_GOOGLE_CLIENT_ID` in `.env.example` (an owner step; the builder documents it).
- Exact storage shape, cache TTLs, card layout, empty/error states, mobile layout.
- Tests: pure logic (channel-id to uploads-id, blend, dedupe, paste parsing) in vitest; the embed itself is verified by hand.

## Open / not verified

- Phone-side resume of a position (History updates, resume untested).
- Clean retest of `LL` (not needed by this design).
- `youtube.readonly` is a sensitive scope: fine for the owner in testing mode; opening this to other viewers would need Google verification and is out of scope.
