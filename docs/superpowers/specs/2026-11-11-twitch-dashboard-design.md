# Twitch Dashboard (the `/twitch` landing page) — Design

**Status:** Draft for the owner's review. The layout was approved by the owner in a visual brainstorm on
2026-11-10; every item under "My calls" is mine and has not been seen by the owner. A fresh reviewer read it
as the builder; its answers are folded in below (my calls 11 to 20, and corrected claims about the code).
Nothing is built.
**Date:** 2026-11-11
**Mockups:** `2026-11-11-twitch-dashboard-mockups/` next to this file. They are fragments written for the
brainstorming companion's frame, so read them as markup; the colours and proportions in them are the reference.

---

## Intent

Today `/twitch` is a sidebar plus a grid of curated demo streams. The owner wants the Twitch landing page to
be a **dashboard about the signed-in viewer's own Twitch world**: who they follow is live right now, what
those streams add up to, and, for an account that streams, how the viewer's own channel has done over the last
30 days.

The owner's wording for the stats: a wall of live follows, "with more stats", and category figures "in text and
not as large thumbnails". For a streaming account: a second row of stat chips in a different box and font
colour, with the rank chip first and a chart of the last 30 days.

## Decided by the owner (2026-11-10)

1. **Live wall.** Everyone the viewer follows who is live, as thumbnail tiles, **newest live first**, with the
   offline follows folded into one line ("N offline").
2. **Stats row** above it, with "more stats" than the current panels show (see "Stat chips").
3. **Category figures as text rows**, not thumbnail shelves: category, how many live follows are in it, how
   many are watching.
4. **Identity strip** at the top using the signed-in user's own Twitch profile picture.
5. **Streamer view:** a second row of stat chips like the first, with a different box colour and font colour,
   shown only for a streaming account. The **rank chip is first**. Its figures may come from TwitchTracker
   (twitchtracker.com).
6. **A 30-day history under the streamer row, as charts:** followers gained/lost, the stream's view count over
   the 30 days, and total time streamed. (The owner asked for "+/-" followers; see the honesty note below.)
7. **Order of work:** this dashboard ships first and needs no server of its own. A history database on the
   owner's IONOS hosting (MySQL + PHP) is a separate, later project (see "Next project").

## My calls (the owner has not seen these; open to change)

1. **Where it lives.** It replaces the demo grid on `/twitch` **for a signed-in user**; the existing
   `ProtocolSidebar` and the page header stay. The demo grid stays for a visitor who is signed out (see
   "Signed out"). `HubPage` (`/`) is untouched.
2. **Order top to bottom:** identity strip; follow stats chips; (streamer only) streamer chip row, then the
   three 30-day panels; then two columns at `lg` (1024px) and up: the live wall (about 2.1fr, with Wall / List
   tabs) and a right column (about 1fr) of the category rows, "Just went live" and "Most watched" cards. Below
   `lg` everything is one column in that order. (At `md` the 220px sidebar plus the rail's 56px reserve leave
   about 450px for content, too narrow for that split; the builder may tune the breakpoint.) See also "Phone".
3. **Wall / List.** The mockup draws two tabs on the wall. **Wall** is the default; **List** is the same
   channels as compact rows (name, category, viewers, uptime). Which tab the viewer last used is remembered in
   a new storage key.
4. **"Streamer" means the rule the code already uses:** `broadcaster_type` is `affiliate` or `partner` (see
   `YourStatsPanel.tsx`). A signed-in non-affiliate sees no streamer row. This hides the row from a small
   channel that TwitchTracker does track; changing the gate is one condition.
5. **Chip definitions** (all computed from the follows data PRISM already loads):
   - **Live now:** live follows / loaded follows. **Watching (all follows):** sum of `viewerCount`.
   - **Typical time live:** the median uptime of the live follows right now (not a historical figure).
   - **Just went live:** how many started within the last 30 minutes. **Longest live:** the longest current uptime
     and whose it is.
   - **Languages:** counts per stream language across live follows, most common first, top three shown.
   - **Oldest follow live:** the live follow with the earliest `followed_at`, shown as name and year.
6. **Category rows:** group live follows by `gameName`, sorted by total viewers; show six, then "+ N more
   categories" which expands in place. A stream with no category goes under "No category".
7. **Identity strip:** profile picture, display name (see "Name colour"), the badge from `broadcaster_type`,
   "following N", "account since <year>", and on the right "N live of M" and "X watching right now".
8. **Streamer row colours:** the mockups use amber on dark amber (the existing `--accent-gold` is `#ffc832`).
   Add dedicated tokens for the row (box, border, text, and a dimmer label colour) rather than reusing
   `--accent-gold` ad hoc. **The dim text colours in the mockups (for example `#8f7a3e` on a dark box) do not
   reach 4.5:1 contrast; pick values that do** (PR #72 raised the muted text colours for exactly this reason).
9. **Charts are hand-written SVG**, no chart library, because the site is a static export and the shapes are
   simple (bars and one polyline).
10. **Bucketing is by the viewer's local calendar day.** A broadcast that crosses midnight counts for the day
    it started.
11. **Wall size.** Show the first 8 live tiles at `lg` and up and the first 6 below it (two per row on a
    phone), then a row "+ N more live" that expands in place to every live follow, as the mockup draws it.
    Tiles are in `sortNewestLiveFirst` order (it exists in `components/rail/sortLiveFollows.ts`; move it to a
    shared place rather than importing from the rail).
12. **Follows not loaded.** The store loads the first 400 follows and keeps a cursor. Do **not** add a "Load
    more" here. Use the same floor marker the rail uses (`RailOfflineLink`: "N+ offline" while a cursor
    remains). The identity strip's "following M" and "N live of M" use the **loaded** count, with a "+" while a
    cursor remains (the store keeps no total from the API).
13. **Browsing links.** For "Nobody live" and "Follows empty", link to the Twitch directory in a new tab (the
    same external link `FollowingPanel`'s empty state uses). No control opens `CategoryPanel` on its own: it
    only opens with a category name. The category rows in the right column **are** clickable: each dispatches
    the existing `OPEN_CATEGORY_PANEL` with its `gameName`, as `ProfileSidebar` does. The header is unchanged.
14. **Session expiry logs the viewer out.** When the follows store (or any dashboard call) reports an expired
    session, the dashboard really logs out (`handleAuthError(new SessionExpiredError())`), so the page flips to
    the signed-out view and its connect card, which says the sign-in expired. A Retry cannot help: `twitchApiFetch`
    has already deleted the token. The same covers a **missing-scope 401** on the streamer calls (the code's own
    comment in `twitchAuth.ts` says a token from before the scope list grew will 401 on the newer endpoints): the
    viewer is signed out and reconnects with the full scopes. Note the existing callers do not do this (see
    "Noted while checking").
15. **History caching.** The Twitch-sourced 30-day history (the followers pages and the archive list) is cached in
    memory per user id (module level) with a 15-minute freshness window: returning to `/twitch` from a channel
    page inside the window makes no new requests. It is not refreshed while the page stays open and is not
    written to `localStorage`. The follows data refreshes as it already does.
16. **Chat name colour versus contrast.** If the chat colour is below 4.5:1 on its background, lighten it until
    it reaches 4.5:1 (as Twitch's own chat does) instead of falling back to white. A small pure function, tested.
17. **Profile not loaded yet.** `state.auth.user` loads after `isAuthenticated` is already true. While it is
    `null`, show the loading skeleton and never treat `null` as "not a streamer" (that would silently hide the
    streamer row). `App.tsx` does not retry a profile call that fails without a 401; expose that failure (a small
    flag in `AppContext`) so the dashboard can show an error card with a Retry for the profile.
18. **The two cards.** "Just went live" lists the three most recently started live follows **whatever their
    uptime**; the chip of the same name counts only those started in the last 30 minutes. "Most watched" lists
    the top three by viewers. The AFFILIATE badge drawn in `dashboard-v2.html` is illustrative.
19. **Recordings are short.** Twitch keeps recordings for a limited time (commonly 14 days for an affiliate,
    **not verified**), so "recordings go back N days" is the **usual** state of panels 2 and 3, not the edge
    case. Days before the oldest recording draw **no bar** (not a zero bar).
20. **TwitchTracker kill switch.** One constant (or flag) switches the whole TwitchTracker client off, so backing
    out is a one-line change if TwitchTracker objects to the use.

## Goals

- A signed-in viewer opens `/twitch` and sees, without clicking, who they follow is live and the figures above.
- A streaming viewer also sees their own channel's last 30 days, with every figure labelled by where it came
  from, so a number is never mistaken for something it is not.
- No new Twitch permission (scope) is requested, and no new runtime dependency is added.

## Non-goals

- No server, database or stored history in this project (that is the next project).
- No hover preview, no panel pop-out, no accounts menu, nothing for YouTube or Kick.
- The existing header panels (`FollowingPanel`, `YourStatsPanel`, `CategoryPanel`), the channel rail and the
  channel page are **not** changed, except the small additions named in "Data and code touchpoints" (a stream's
  language, two new `twitchApi.ts` functions, an extended `getVideos`).
- No notifications, no editing of anything on Twitch.

## Anti-goals (a failure even if it technically works)

- Showing a missing TwitchTracker figure as `0`. Missing is `–`.
- A chart that implies who unfollowed. Twitch does not list that (see the honesty note).
- The page jumping when TwitchTracker's answer arrives late: reserve each chip's height.
- Making the page wait on TwitchTracker, or on the 30-day history, before the rest renders.
- Extra Twitch traffic: the follows data must come from the existing shared store, not a second poll.

## What the page shows

### Identity strip and follow stats (every signed-in viewer)

The identity strip, the chips and the live wall / right-hand cards are as in `dashboard-v2.html`. Data
comes from the shared follows store (`useFollowedChannels(userId)`, `EnrichedFollow`: `isLive`, `viewerCount`,
`gameName`, `startedAt`, `thumbnailUrl`, `followed_at`). The store already refreshes who is live once a minute
while the tab is visible; a dashboard is one more subscriber and costs nothing. Uptime text should tick each
minute without refetching.

Each tile links to `/twitch/<login>` (the channel page). The wall shows the live follows **loaded so far**,
with the size and floor-marker rules of calls 11 and 12.

**Name colour.** The owner asked for the profile's colours "if we can pull them". Twitch's official API gives
no profile theme colours and no banner. It does give the viewer's **chat name colour**
(`GET /helix/chat/color?user_id=`, no extra permission; an empty string means never set). Use it for the
display name, and fall back to the normal text colour when it is empty or the call fails. Nothing else is
coloured from the profile.

### Streamer row (signed-in `affiliate` / `partner` only)

Chips, in order, as in `dashboard-v4-history.html`: **Rank** (first, a little larger), Followers, Subscribers,
Avg viewers, Peak viewers, Hours streamed, Hours watched, Followers gained.

| Chip | Source | Field |
|---|---|---|
| Rank | TwitchTracker | `rank` (shown `#18,402`) |
| Followers | Twitch | the signed-in channel's total (`getBroadcasterFollowerCount`) |
| Subscribers | Twitch | total from the broadcaster subscriptions call (`useYourStats` already reads it) |
| Avg viewers / Peak viewers | TwitchTracker | `avg_viewers` / `max_viewers` |
| Hours streamed | TwitchTracker | `minutes_streamed / 60` |
| Hours watched | TwitchTracker | `hours_watched` (compact, e.g. `3.5k`) |
| Followers gained | TwitchTracker | `followers` (shown `+96`) |

Every TwitchTracker chip carries a small **TT** tag and a tooltip "TwitchTracker, last 30 days". A one-line
note in the row's header says figures marked TT come from twitchtracker.com. If TwitchTracker has no data
for the channel (see below), the TT chips show `–` and the row header says the 30-day figures appear once
TwitchTracker tracks the channel (`dashboard-v3-streamer.html`, second mockup); the Twitch-sourced chips
still show.

`useYourStats` cannot be used partially (with `isStreamer` true it fetches all seven sections), so this row gets
its own small hook over `getBroadcasterFollowerCount` and `getBroadcasterSubscriptions` (the subscriber total).
While the Your Stats panel is open these two cheap calls run twice; that is accepted, and the panel is unchanged.

### The three 30-day panels (streamer only), as in `dashboard-v5-30days.html`

Each panel has a big number and a small chart. The big number is TwitchTracker's; the chart shape is built
from Twitch's own data. **The two are different things and the panel says so.**

1. **Followers.** Big number: TwitchTracker's `followers` (+96, TT). Bars: new followers per day from
   `GET /helix/channels/followers` (newest first; `followed_at`; needs `moderator:read:followers`, which
   PRISM already requests and `getBroadcasterFollowerCount` already uses). Page through (100 per page) until a
   `followed_at` older than 30 days, **capped at 10 pages (1,000 followers)**; if the cap is reached first,
   the bars cover only the span reached and the axis and caption say so.
   *Honesty note:* the bars show **gains only**, built from people who still follow. Twitch does not list who left, so
   this chart can never show a loss. A true "+/-" needs the next project to record the follower total daily.
2. **Views per stream.** One point per broadcast from the viewer's archive recordings of the last 30 days
   (`getVideos` today takes only a user id and a count: add an optional `type` filter and a cursor, or filter
   the 50 it returns on the client): the
   **views of its recording** (not live viewers), x by date. The caption says recordings keep gaining views
   after the stream, so older points are not comparable with newer ones.
3. **Time streamed.** Big number: TwitchTracker's `minutes_streamed / 60` (TT). Bars: hours streamed per day,
   summed from the archives' `duration` (the parser already exists, privately, in `useDerivedStats.ts`;
   move it to a shared place rather than copying it).

Panels 2 and 3 only see recordings Twitch still keeps. **Twitch's retention for this account is not verified**
(it depends on the account type and the streamer's own deletions; commonly 14 days for an affiliate, which would
make the under-30 case the usual one). Work out the covered span from the oldest archive returned and show
"recordings go back N days" whenever it is under 30; days before the oldest recording draw no bar (call 19).

When TwitchTracker has no data, the big numbers fall back to what the chart itself sums (followers in the bars,
hours in the bars) **without** the TT tag.

### TwitchTracker integration (this project, browser-side)

TwitchTracker publishes a "basic API" and says on its own pages "Scraping is prohibited. Use this basic API."
Facts checked on 2026-11-10:

- `GET https://twitchtracker.com/api/channels/summary/<login>` answers JSON
  `{rank, minutes_streamed, avg_viewers, max_viewers, hours_watched, followers, followers_total}`
  (30-day window; `followers` is the 30-day change, which TwitchTracker calls gained; whether it can be
  negative is **unverified**).
- `access-control-allow-origin: *`, no key, so the browser can call it directly.
- A channel it does not track answers **HTTP 200 with `{}`**. `{}` means "no data", never zeros.
- Rate limits and terms for this API are **not published**, and `robots.txt` disallows `/api/*` for crawlers.

Rules:

- One request for the signed-in streamer's **own** channel only, and only when the streamer row is shown.
- Cache the result in `localStorage` (a new `LOCAL_*` key with a `prism_tt_` prefix, in `storageKeys.ts`):
  **6 hours** for a real answer, **1 hour** for `{}` (my call), keyed by login. A cache hit makes no request.
- **Fail silent.** Network error, CORS error, non-200, non-JSON or an unexpected shape all count as "no data".
  Validate that each used field is a finite number; ignore a field that is not. On HTTP 429 make no further request this session.
- Send nothing but the login in the URL. The request reveals the viewer's IP and the channel login to a third party;
  the note in the row header is the disclosure.
- Link the source: "TwitchTracker" links to `https://twitchtracker.com/<login>`.
- One constant switches the whole TwitchTracker client off (call 20).

## States

- **Signed out:** `/twitch` is unchanged (the demo grid), plus a card above it inviting the viewer to connect
  Twitch to see who they follow that is live (use the existing `ConnectTwitchButton`). **No Twitch API call
  that needs a token and no TwitchTracker call is made.**
- **Follows loading:** skeleton blocks in the positions of the chips and tiles. **Error:** a card with the
  message and a Retry button that calls the store's `refetch` (new UI: `FollowingPanel` has no Retry). A
  `SessionExpiredError` is not an error card: it logs the viewer out (call 14). **Profile not loaded:** call 17.
- **Nobody live:** the chips show `0` for counts and `–` for the "typical / longest / languages / oldest" chips;
  the wall is replaced by "No one you follow is live", the offline count and the directory link of
  call 13.
- **Follows empty (the viewer follows no one):** a short message, the same directory link, no chips.
- **A streamer row section fails** (followers, subscribers, a TwitchTracker call or the history): that section
  shows its own small error or `–`; the others still render (the per-section pattern of `useYourStats`).
- **Reduced motion:** no animated counters; uptime simply updates.

## Phone (below `md`)

My call: identity strip stacks (picture and name, then the totals under them); chips wrap into a two-column
grid; the wall shows two tiles per row; the right-hand cards drop below the wall; the three panels stack in one
column; the streamer row sits directly under the follow chips. The `ProtocolSidebar` already collapses below
`md` (the mobile tab bar), so nothing changes there.

## Accessibility

Every chip is a label plus a value in text (not colour alone; the TT tag is text). Each chart has
`role="img"` and an `aria-label` that states the figure and the span, for example "Followers gained per day,
last 30 days, total 96". Tiles are links with the channel name, category and viewer count as their accessible
name. All text colours reach 4.5:1 on their box.

## Data and code touchpoints

Follow the project's conventions: Twitch calls only through `lib/twitchApi.ts`, state in the existing
context and stores, env vars prefixed `VITE_` (none are added), storage keys only through
`config/storageKeys.ts`, Tailwind v4 with the CSS tokens in `index.css`.

- **New in `lib/twitchApi.ts`:** a chat-colour call, and a followers call that pages newest-first until a cut-off
  date or a page cap and returns the `followed_at` values (not the follower identities), and an optional `type`
  filter and cursor on `getVideos`. The followers call returns `total` on its first page, so the Followers chip
  may take it from there instead of calling `getBroadcasterFollowerCount` separately.
- **`EnrichedFollow` has no stream language.** The Languages chip needs `language` kept from the streams
  response in `lib/followsStore.ts` (it is on `TwitchStream`). Keep the change additive.
- **TwitchTracker client** in its own file (it is not the Twitch API) with a pure parse function, and a hook
  around it.
- **Pure stat functions** (chip figures, category grouping, per-day bucketing of followers and of archives,
  chart geometry) in their own module so they test without a browser.
- A suggested layout, the builder may change it: `src/components/dashboard/` for the page and its parts,
  `src/lib/dashboardStats.ts`, `src/lib/twitchTracker.ts`, and hooks for the TwitchTracker summary and the
  30-day history.
- **Keep the history hook's output a plain array of `{ at, value }` plus `coverageDays` and a `source`
  label,** not Twitch types, so the next project can serve the same shape from stored history. `at` is a
  timestamp, not a day string: two broadcasts can fall on one day in the per-broadcast series.
- **Reuse what exists:** `sortNewestLiveFirst`; `Sparkline.tsx` (`components/player`) as a reference for the
  hand-written chart style; `src/__tests__/contrast.test.ts` (PR #72) for the contrast rule. `formatUptime`
  renders `H:MM:SS`, so a compact `2h 40m` formatter is new.

## Testing

Vitest and Testing Library, as in the rest of the project (tests live in `__tests__` folders beside the code).
At least: every chip function with a live, an empty and a partly-loaded input; category grouping and the
"No category" bucket; the TwitchTracker parser (a real answer, `{}`, a wrong shape, a non-number field, a
network failure, a cache hit, an expired cache, a 429); follower bucketing across a day boundary, over the
page cap, and with no followers; archive bucketing for a broadcast that crosses midnight; the signed-out view
making no token-needing or TwitchTracker request; the non-streamer view showing no streamer row; and the
streamer row with TwitchTracker failing; an expired session logging the viewer out; the wall's cap and its
"+ N more live" expander; the chat-colour lightening; and the history cache (no new request on a remount
inside 15 minutes). The suite is large and can crash its workers when the dev server is
up on Windows; run it with `--maxWorkers=2` (an unrelated flake).

## Done means

1. Signed in, not a streamer: `/twitch` shows the identity strip, the seven chips, the wall and list, the
   category rows and the two cards, at desktop and at 375px wide, matching the mockup.
2. Signed in, affiliate or partner: the streamer row and the three panels, with TT tags, and with TwitchTracker
   blocked (offline) the page still renders the rest and shows `–`.
3. Signed out: the demo grid and the connect card, and no token-needing or TwitchTracker request.
4. Nobody live and follows-empty states render, and an expired session flips the page to the signed-out view
   with the connect card.
5. No layout jump when TwitchTracker answers; no new runtime dependency; type check, lint, tests and the
   production build are clean.

## Unverified (check, do not assume)

- Twitch's recording retention for the signed-in account (affects panels 2 and 3).
- Whether TwitchTracker's `followers` can be negative.
- Whether Twitch's image CDN allows reading pixels (only matters if colours are ever taken from a picture; not in scope).
- TwitchTracker's rate limits and terms for the basic API.

## Noted while checking (not part of this project)

`FollowingPanel`, `YourStatsPanel`, `CategoryPanel` and `ChannelRail` hand the follows store an auth-error
callback of `handleAuthError(null)`. `handleAuthError` only acts on a `SessionExpiredError`, so none of them
ever logs the viewer out when a token expires: `twitchApiFetch` deletes the stored token, but the app still
treats the viewer as signed in and a Retry fails forever. The dashboard does it correctly for itself (call 14).
Fixing the other four is a separate small change, recorded in the project backlog.

## Next project (not part of this one)

A **history database** on the owner's IONOS hosting (MySQL, with a small PHP script in front; the hosting's PHP
and outbound-request support are not verified). The owner's decisions so far, for the record: a channel starts
being stored only when someone opens its channel page in PRISM; the server, not the browser, collects the
numbers (TwitchTracker's summary and Twitch's public data) so nothing can be forged; the table also keeps a
channel's YouTube / Kick links read from its Twitch bio (user submissions much later). That project gets its own
design. This dashboard only has to keep the history hook's output shape simple (see "Data and code touchpoints").
