# Usage tracking with Matomo (design)

Status: APPROVED by the owner 2026-11-24. Builds on NooRotic/prism#134 (the address fragment is never sent),
which must merge first. One front-end PR; nothing on the history server changes.

## Why

The owner wants "good insight into what's being used", not a report of button clicks:

- Is anyone using HLS / DASH, and which streams do they choose?
- Which Twitch and YouTube channels are used?
- Is the Twitch-YouTube link feature used, and for which accounts?

Today Matomo (stats.pollardjr.com, site 4) counts only the first load of a visit, and PRISM's own counter (`POST /api/hit`)
counts page changes in six sections. Neither can answer these.

## Goals

- Every page change is a Matomo page view with a readable title and a tidy address.
- Streams, channels and linked accounts appear by name in Matomo's Events report.
- Interest is told apart from what PRISM does by itself (the default stream, links saved automatically).
- A deep link from another site keeps the real referrer.

## Non-goals

- No server work, no new `/admin` screen, no change to `/api/hit` or the history server (it still stores nothing about visitors).
- No viewer identity: no Twitch or Google account name, no user id, no cookies.
- No search words, no per-button tracking.

## Anti-goals

- A pasted stream address, a search, a sign-in token or an `/import` list reaching Matomo in any form.
- Tracking that can slow, break or delay a player. Every call is best effort and never throws.
- Numbers that look like interest but are PRISM's own doing.

## Approaches

| | What | Trade-off |
|---|---|---|
| A | Own server: daily totals, new table, new `/admin` screen | Not tied to visits; PHP, migration and deploy; cannot tell one person from fifty |
| **B (picked 2026-11-24)** | Matomo page views and events | Front end only, ready-made reports, visits and sources; misses visitors with blockers, DNT or GPC |
| C | Both | Most work |

The owner dropped the "counts, not people" rule for usage tracking, which removed the reason to prefer C over B. If the gap
(below) turns out too big, a server can be added behind the same one function.

## The parts

1. **`src/lib/analytics.ts`** (new): `trackPage(path, title, options)` and `trackEvent(category, action, name?)`. They push to
   `window._paq` and do nothing when it is absent, so localhost, previews, DNT and GPC need no extra checks: the block in
   `index.html` creates `_paq` only where counting is allowed.
2. **`src/lib/analyticsPage.ts`** (new, pure): turns a path into `{ path, title }` or null (table below).
3. **`src/hooks/usePageView.ts`** (new), called beside `usePageHit` in `HitReporter`, with the same rule for what a page change is
   (a different path, trailing slash ignored). `usePageHit` is untouched.
4. **`index.html`**: the block keeps its settings (including `discardHashTag`) and its link tracking but no longer sends the page
   view itself; the hook does, so there is one place that decides what address is sent.
5. **`public/404.html`**: before redirecting, keeps `document.referrer` in `sessionStorage` (`prism_entry_referrer`) when it is
   another site. The first page view sends it with `setReferrerUrl` and removes it. Without this, every deep link looks like it
   came from PRISM itself (seen live 2026-11-24). Only the first page view has it; later ones use the previous page's address.
6. **Call sites** for the events below, one line each.
7. **The note** (see "Notice").

### Addresses that are sent

Query strings and fragments are never sent, with one exception: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and
`utm_term` on the first page view. A path that does not match its pattern is replaced, because a path can hold pasted text
(`SmartUrlInput` opens `/youtube/<the whole pasted address>` when it finds no video id).

| PRISM path | Sent as | Title |
|---|---|---|
| `/` | same | Home |
| `/twitch`, `/youtube`, `/hls-dash` | same | Twitch, YouTube, HLS / DASH |
| `/twitch/<login>` (1 to 25 of A-Z a-z 0-9 _) | lower case | Twitch channel |
| `/youtube/catchup` | same | YouTube: Catch up |
| `/youtube/<11-character id>` or a demo id | same | YouTube video |
| `/hls-dash/custom` | same | HLS / DASH: pasted address |
| `/hls-dash/<12 hex>` or a demo id | same | HLS / DASH stream |
| `/import` | same | Import |
| anything else under those three sections | `/<section>/other` | <Section>: other |
| no route | `/not-found` | Not found |
| `/admin/*`, `/chat/*`, `/chat-youtube/*`, `/popout/player` | nothing | (the owner's tool; parts of a page already counted) |

Link tracking stays on, but the "Open address" link on a failed stream (`StreamStatus.tsx`) gets Matomo's ignore class, because
clicking it would otherwise send the pasted address as an outgoing link. This gets a test.

### Events

| Category | Action | Name | When |
|---|---|---|---|
| HLS / DASH | chosen | stream name | the address names a listed or demo stream (a card click or a shared link) |
| HLS / DASH | played | stream name, or `Pasted address` | first `onPlaying` for that stream. Only `VideoJSPlayer` calls it today; `DashJSPlayer` handles the video's `playing` event but never tells the page, so it gets the same call (it also clears the stall notice, as it already does for HLS) |
| HLS / DASH | default played | stream name | the same, when the page opened on its default stream |
| HLS / DASH | failed | stream name, or `Pasted address` | no engine could play it (`markFailed`) |
| Twitch | opened | login | a channel page opens |
| YouTube | opened | `Channel title (UC...)` | the video's details arrive; once per video |
| Linking | linked | `twitch/x <-> youtube/Title` (or `kick/y`) | the viewer saves a link (either modal, or accepts a suggestion) |
| Linking | auto-linked | the same | `useLinkSuggestion` saves one by itself because both bios agree |
| Linking | unlinked | the same | the viewer removes a link |
| Linking | followed | the same | the viewer opens a linked account's chip (Twitch page), or the linked YouTube chat pop-out |
| Feature | video pop-out, chat pop-out, YouTube chat pop-out | (none) | the window opened |
| Feature | paste | the detected type (twitch, youtube, hls, dash, mp4, unknown), never the text | a paste or search is submitted |
| Feature | favorite | stream name | a stream is starred (not un-starred) |
| Stayed | 1 min, 10 min | the same name as "opened", "chosen" or "default played" | the page has been visible that long on one path |

The admin Playlist preview also uses `StreamPlayerPanel`; it reports nothing, because the page passes the callbacks and the preview
does not. "Stayed" exists because Matomo measures time between actions, so someone who opens one stream and watches for an hour
would otherwise show as zero seconds.

## Do Not Track and Global Privacy Control

**Decision proposed: honor both, as now, and look again in two weeks with numbers.**

- Those visitors are not invisible today: `/api/hit` counts their page changes by section, with nothing about them.
- That also measures the gap for free. Both counters follow the same page-change rule, so
  `1 - (Matomo page views / own page opens)` for Home, Twitch, YouTube and HLS / DASH is roughly what Matomo misses (blockers
  included, pop-outs excluded). Compare from about 2026-12-08, on days with real traffic.
- If it is more than about 1 in 5 (the owner's own trigger from 2026-11-17), the next step is small: stop honoring **DNT**, which
  browsers have been retiring (Firefox removed it in version 135, February 2025), and keep honoring **GPC**, which is current and
  has legal force in some US states as an opt-out of selling or sharing data. The Matomo admin setting "Support Do Not Track preference" must be turned off
  as well (the owner's password), and that setting covers every site on that Matomo.
- Not proposed: a second, anonymous Matomo site for those visitors. It is more work and gives numbers that cannot be compared.

This is not legal advice. Sources, from a search summary on 2026-11-24:
[Do Not Track](https://en.wikipedia.org/wiki/Do_Not_Track) and
[Global Privacy Control](https://en.wikipedia.org/wiki/Global_Privacy_Control) (Wikipedia),
[Global Privacy Control](https://support.mozilla.org/en-US/kb/global-privacy-control) (Mozilla).

## Notice

Today one line, on the home page only, hidden from visitors who are not counted by Matomo. Since more is counted, the line changes
and moves where everyone can find it: the header's Accounts row (every page) as well as Home. It has two versions, so it is true for
everyone:

- Counted by Matomo: "Visits, and what is played or linked, are counted by Matomo on my own server, with no cookies and shortened
  IP addresses."
- Not counted by Matomo (DNT, GPC): "Page opens are counted, with nothing about you."

CSS decides (`html.counted`), as now, so no script has to run for the second one. The Accounts row is outside the chat and video
pop-outs, which stay bare.

## Testing

Test first, each seen failing:

- `analyticsPage`: every row of the address table, including a pasted address in `/youtube/...` and a hostile login.
- `analytics`: silent and harmless with no `_paq`; exact pushes with one.
- `usePageView`: one view per path change; query, fragment and trailing slash do not count; `utm_` only on the first; referrer once.
- `matomoBlock.test.ts`: no page view in the block, `discardHashTag` still before everything, nothing for DNT / GPC / other hosts.
- `404.html`: the referrer is kept only when it is another site.
- Each call site: the event fires once, with the right name, and never with an address. `useLinkSuggestion` reports "auto-linked" and
  `accept` reports "linked".
- The note: both versions, in both places.
- By hand, with the real `matomo.js` pointed at a dead local address: page views while moving through PRISM, a played HLS and a
  played DASH stream, a failed stream and its "Open address" link, and a deep link through 404. Read every request for anything
  that should not be there.

## Going live

Merge #134, then this PR (a merge to `main` deploys). Then one visit to the live site, checked in Matomo's Pages, Events and
Referrers reports. Nothing to install and nothing to change in Matomo.

## Calls made in this design (for the owner to check)

1. Pop-out windows count as a Feature event, not as page views. They are page views today.
2. `/admin` opens are no longer counted by Matomo (they are today).
3. Unknown paths are sent as `/not-found`, never as typed.
4. "Stayed" at 1 and 10 minutes.
5. Favorites, pop-outs and the type of a paste are in; search words and every other button are out.
6. Twitch logins are not checked against Twitch (a signed-out visitor has no way to), so a mistyped channel can appear in the report.
7. The note in two versions, on Home and in the Accounts row.
8. DNT and GPC stay honored for now.
