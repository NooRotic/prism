# PRISM playlist and admin panel: design

Date: 2026-11-13. Status: draft for owner approval.
Builds on [the history server design](2026-11-12-history-server-design.md) (the PHP + MariaDB service at
`https://prism-data.nooroticx.tv`, shipped as PR #79) and the HLS paste and error work (PR #80).

**Marks.** Anything the owner decided is under "Decided by the owner" or is quoted. Every choice that was mine rather than
the owner's is marked **(my call)**. Numbers marked as starting points are meant to be tuned.

## Intent and why

The owner, in their own words:

> "my original thought was to use the media-demo playlist to begin/start but my thought of a simple admin panel might be of
> use to manage those streams. I thought about a admin panel but the channels saved feature didn't seem like enough to
> warrant a whole frontend but this might if we do it this way, could manage that playlist there, see stats etc"

> "I want to eventually create a better system for the playlist and now that we confirmed ionos php+mysql support, we can
> maybe long phase plan to store working urls and delete broken ones."

When asked what the panel is for day to day:

> "for prism it'd be usage of site and how many TT calls were made. the playlist is almost a set-it-forget-it so not much
> daily after setup"

So the panel earns its place mainly as the gauge for the PRISM server (is the site used, where, and how much of the
TwitchTracker budget is spent). The playlist rides along and must look after itself: it starts from the media-demo list
(which comes from the public iptv-org channel list), keeps the streams that work, and drops the ones that stop working,
with almost no daily work from the owner.

The owner also asked what could be learned from how the media-demo page uses web workers. The answer is in
"What was taken from media-demo".

## How the work splits

One system, four pieces, built in this order. This one document carries all the shared decisions, with full detail for piece 1
and decision-level detail for pieces 2 to 4. Each of 2 to 4 gets its own implementation plan, and a short check-in with
the owner before it is planned, when it is its turn.

1. **Panel and stats.** Owner sign-in, the admin screens, daily usage counters, TwitchTracker call history, the log of
   refused attempts, the audit list, and a Channels page. Useful the day it ships, because the server is already live.
2. **Playlist store, import and visitor list.** The stored list, the one-time import of the media-demo list, the
   Playlist screen in the panel, and the new HLS page layout for visitors.
3. **The checker.** A scheduled server job that decides which streams are listed, with automatic removal, the Health
   screen, and visitor play and fail counts.
4. **Player extras.** Captions end to end, a labelled Debug button, and the trailer.

## Goals

- The owner opens one page and sees whether PRISM is being used and where, and how many TwitchTracker calls were made
  against the daily budget.
- Visitors to the HLS page see a demo video load, a playlist of streams that work, a collapsible "About this stream" panel,
  an option to see debug information, and full captions on streams that carry them.
- The playlist keeps itself clean: streams that stop working disappear from the visitor list without the owner doing
  anything, and come back if they recover.
- Only the owner can see the panel, and the owner is told who else tried.

## Non-goals

- No visitor submissions. Nobody but the owner adds streams.
- No counting of people or places. Usage is counted in page opens, never in visitors or countries.
- No hosting of anyone's streams. PRISM links to and plays public streams; it does not store or relay them.
- No proxy that adds headers or gets around CORS or mixed content for streams.
- No frame-grabbing thumbnails of videos in the first version.
- PRISM stays a static site on GitHub Pages. The server stays on IONOS.
- Twitch and YouTube links never go through the stream checker.

## Anti-goals (a failure even if everything "works")

- The admin side becomes a way in: a screen or endpoint that returns secrets, runs code on the host, or fetches an
  address for a caller and shows what came back.
- The checker becomes a way to attack other machines (private networks, the host's own services) or a way to burn the host's
  bandwidth.
- A stream is deleted for good because of a blip, a region difference, or one host being down.
- The server starts storing anything about visitors beyond the single exception under "Trust model".
- Visitors' browsers contact dozens of outside image hosts just to show logos.
- The page freezes under thousands of channel cards, as media-demo does.

## What exists today (verified in the repo and the notes folder)

- **Playlist.** `src/config/demoContent.ts` holds 11 hard-coded entries (6 Twitch channels, 3 HLS, 2 DASH).
  `ProtocolPage` lists them; `resolveStreamSource` resolves a demo id, or a pasted address via `?url=`.
- **The server.** `server/` is a dependency-free PHP 8.4 service with MariaDB (11.8 on the host), a router with an origin
  allowlist and preflight handling, a shared TwitchTracker gate, a numbered migration runner, a refresh job run by cron every
  four hours (`17 */4 * * *` under `/usr/bin/php8.4-cli`), kill switches, and counts-only logs. It stores no visitor data.
  Its secrets live in `/prism-data/config.php`, which the owner creates and no tool reads.
- **TwitchTracker calls are already counted per day.** `TtGate` adds one to a `tt_calls:<UTC date>` row in `job_state` on
  every call, kept since launch. The budget is `tt.day_budget` (default 1,500) and `tt.run_budget` (300). A pause after a
  429 is stored as `tt_paused_until_ms`.
- **Site usage is not counted.** The server keeps, per channel, when it was first seen and last visited (written at most
  hourly). There is no daily count of page opens and nothing about the playlist.
- **Sign-in.** PRISM already signs viewers in with Twitch (implicit grant, `src/lib/twitchAuth.ts`). The token is kept in
  `localStorage`. The history server uses its own separate Confidential Twitch app.
- **Probe.** `src/lib/streamProbe.ts` is a browser-side probe with the vocabulary ok / http / not-playlist / unreachable /
  mixed-content. A browser can only learn "played or failed", and cross-origin limits what it can see.
- **Player.** Video.js 8.23 (HLS through its built-in engine) and dash.js 5. There is no caption-specific code. The
  stats panel exists but hides behind an unlabeled gear in the header.
- **media-demo (wsp-sender), read only.** `public/data/HLS_valid.m3u` (March 2026): 5,234 entries; every one has an id, a
  logo and a group; 4,304 (82%) have a country in the id, across 166 countries; 28 distinct groups, 1,690 (32%) of them
  "Undefined"; 131 logo hosts, 3,632 logos on imgur; 1,176 (22%) stream addresses are plain `http://`. No adult groups in this snapshot.
  Nothing in that page checks whether a stream is alive.
- **IONOS.** PHP 8.4, MariaDB, cron and SSH, 2 TB of space (about 6.4 GB used on 2026-11-11). Outbound HTTPS from PHP is
  verified. Traffic limits, cron frequency limits, PHP's `ffmpeg` and image-library availability are not verified.

## What was taken from media-demo

- **Taken:** the data. It comes from the public iptv-org project, which the owner confirms is its source.
- **Not taken:** the code. The review found one worker that only parses the file, no liveness check anywhere, list
  positions used as ids (so saved resume points point at a different channel after the list changes), a group filter that
  never matches multi-group channels, a fallback parser that gives different channels the same id, about 5,000 cards mounted at once, and
  playlist text written into the page as raw HTML.
- **Answer to the worker question.** The unusual part is a hand-written static worker that boots while the playlist
  downloads. Its job (parsing) is not needed in PRISM's design, because parsing happens once on the server and visitors load
  a ready-made compact file. If an in-browser import ever returns, use a bundled module worker, give every request an id, and
  stream results in batches.
- **Lesson kept:** every list shown to visitors escapes all playlist text, and the page renders only what is on screen.

## Approaches considered

### Where the admin screens live and how the owner signs in

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | A page inside PRISM at `/admin`, signed in with the owner's Twitch account. The server checks the token with Twitch. | One codebase, reuses PRISM's React, styling and charts, and the playlist screens (forms, a table of thousands of streams) suit this stack. No password exists to guess or leak. Cost: the admin code ships in the public bundle (only a sign-in prompt is visible without a valid token), and the admin API needs CORS for an Authorization header. |
| B | Pages served by the PHP server behind IONOS's password-protected folder. | Nothing admin in PRISM's bundle and a simple login, but a second hand-built interface with its own charts and look, a password prompt with no logout, and a poor fit for pieces 2 and 3. |
| C | No screen: SSH scripts plus a stats address. | Cheapest, but the owner said the panel now justifies a frontend. |

Picked by the owner: A, with the owner's addition of logging Twitch users who try.

**What counts as "trying" (raised by the builder check; the owner chose 2).**

| | Approach | Trade-off |
|---|---|---|
| 1 | Automatic: opening `/admin` while signed in to PRISM sends the viewer's existing Twitch token to the server, which names and logs the person. | Matches the original request word for word, but PRISM's stored token carries nine permissions (subscriptions, bits, VIPs, polls and more), so any signed-in viewer who only types the address would have that token sent and a named row written without doing anything. |
| **2 (picked)** | A separate admin sign-in: a Twitch authorisation with no permissions (identity only), under its own storage key. Only people who go through Twitch's authorise screen are logged. | Easier to defend, because the log holds only people who deliberately tried, and no viewer's regular token reaches the server. The owner clicks Authorize once per admin sign-in. |

### What "broken" means

| | Approach | Trade-off |
|---|---|---|
| A | Server check only, nightly. | Fully automatic, but blind to codecs and regions; IONOS is one datacenter, so geo-blocked streams look dead. |
| B | Visitor reports only. | Real-browser truth, but only when someone clicks, and anyone can script fake reports. |
| **C (picked)** | The server check decides. Visitor plays and fails only move a stream up the recheck queue. | Stays set-and-forget and still learns from real plays. |

Picked by the owner: C.

### Admin panel layout

A one page with everything; B tabs across the top; **C a menu down the left with a short Overview home (picked)**. C gives the
later playlist screens a whole page each. Picked by the owner.

### HLS page layout

A player on top with the list underneath; **B player left, list right (picked, then changed)**; C pinned strip plus Browse all.
The owner picked B with changes: the right column holds a collapsible "About this stream" panel instead of the list, the
channel list sits underneath like A, the panel folds away by itself after 30 seconds, and it carries a picture, a country
flag and large text. Mockups for these are in `.superpowers/brainstorm/` (git-ignored); the written description below is authoritative.

### How visitors receive the list (my call)

| | Approach | Trade-off |
|---|---|---|
| **Snapshot file (picked)** | After each check, the server rewrites one compact file; the browser loads it once and filters locally. | About 4,000 entries is a few hundred KB (much less compressed). No server call per keystroke, almost no load on IONOS, works with a plain static host. The list can be up to a few hours old. |
| Paged API | `GET /api/streams?query=...` | Always fresh, but a server hit per search and per scroll, and PHP per visitor. |

### Logos and pictures (my call)

| | Approach | Trade-off |
|---|---|---|
| Hotlink | Point the page at each logo address. | Nothing to build, but each visitor's browser contacts the logo hosts (131 of them, 70% imgur), links rot, and the owner's no-visitor-data stance is weakened. |
| **Own copy (picked)** | The server fetches each logo once and serves its own copy. | Costs storage (small) and a guarded fetch; visitors contact only PRISM's server. A letter tile covers missing or unusable logos. |

### Trailer storage (not decided)

Candidates: HLS files on the IONOS webspace (preferred, because it also shows off PRISM's own captions and debug), YouTube
unlisted (zero effort, but not PRISM's own player path), or a single MP4 in the repo (not recommended: repository growth, no
adaptive bitrate). The design does not depend on the answer: the trailer is just one playlist entry marked "default".

### Order (my call, agreed)

Panel and stats first because the server is live and its budget matters now; store and visitor list second; checker third, because
the list needs the store; player extras last because they touch shared player files.

## Decided by the owner

- Only the owner adds streams. Links visitors paste are not saved.
- The panel is mostly a gauge: usage of the site and TwitchTracker calls. The playlist is set-and-forget.
- "Usage" means counts by part of PRISM ("where in PRISM"), not people and not places. The owner chose not to count by
  country, which would have required handling visitors' IP addresses.
- Sign-in is Twitch, through a **separate admin sign-in** (a Twitch authorisation with no permissions, identity only) rather
  than PRISM's viewer sign-in, so no viewer's regular token is ever sent to the server. Twitch users who go through it and
  are refused, and anyone who sends the server a valid Twitch token that is not accepted, are logged by name (the owner's
  request and choice).
- A short list of recent admin changes is included.
- "Broken" is decided by the nightly server check; visitor reports only reorder checks (C).
- Piece order: panel and stats, playlist store, checker, player extras.
- Admin layout C. HLS page layout B as modified above. The About panel folds after 30 seconds and carries a picture, a
  flag and large text.
- Publishing the list is fine: its source is the iptv-org repo, and PRISM links to and plays the streams without hosting them.
- The owner's visitor-facing description of the HLS page: a demo video loading, a playlist of working streams, an option
  to see debug info, and full caption support when streams carry captions.

## Trust model: one exception, stated plainly

The history server stores nothing about visitors. This design keeps that rule with **one exception requested by the owner**:
the log of refused admin attempts (below). Only people who go through the admin sign-in's Twitch authorise screen, or who
script a call with a valid Twitch token, can appear in it, and PRISM's regular viewer token is never sent to the server.
Everything else added here is a count with no identity: no IP, no hash of one, no cookie, no user agent.

## Piece 1: panel and stats (full detail)

### Admin sign-in

- The front end gets an `/admin` route, loaded as its own chunk. Signed out, it shows a sign-in screen and nothing else: a
  short line saying the page is for the site owner and that signing in records the Twitch name of anyone who is not the
  owner, and a "Sign in as admin" button.
- **A separate admin sign-in, not PRISM's viewer sign-in (the owner's choice).** The button starts a Twitch authorisation for
  PRISM's app with **no permissions** (identity only). Its token is kept under its own storage key in `sessionStorage`
  (my call: the browser forgets it when the tab closes, but Twitch honours an unrevoked token for weeks, so **Sign out revokes it at Twitch**; found by the final review), apart from the viewer token in `localStorage`. The request sets `force_verify`
  so Twitch always shows its own authorise screen, even to someone who has already authorised PRISM. That screen is the
  deliberate act that counts as "trying" (my call; the builder confirms Twitch's behaviour). The owner clicks Authorize each
  time. PRISM's regular sign-in token, which carries nine permissions, is never sent to the server.
- Admin requests go to the history server under their own path prefix, with the Twitch token in an `Authorization: Bearer`
  header. There are no cookies, so there is nothing to forge across sites.
- For each admin request the server asks Twitch (`id.twitch.tv/oauth2/validate`) who the token belongs to. It accepts the
  request only if **all three** hold: the Twitch user id equals the configured owner id, the token's client id equals
  PRISM's front-end Twitch client id (so a token the owner gave to some other site cannot be reused here), and the token
  carries **no permissions** (so the owner's own long-lived viewer token, even if stolen, cannot administer anything). (the
  third check is my call)
- **Config (the owner adds two lines to `config.php`, neither a secret):** `admin.owner_twitch_id` and
  `admin.frontend_client_id`. A third flag, `admin.enabled`, switches the whole admin side off without a redeploy (my call,
  matching the other kill switches). `config.example.php` gets placeholders. The new keys are **optional with safe
  defaults**: the admin side is off until both ids are set, and a missing or empty owner id can never match any user. The
  server reads every config key at load, so this is what keeps the live public API working if the code is deployed before the
  owner adds the lines. (my call)
- Before any Twitch call the server rejects tokens that are not the shape of a Twitch token. A successful owner validation is
  cached by a hash of the token (never the token itself) for the shorter of the token's remaining life and 30 minutes, so
  normal use makes few Twitch calls. Validation calls for unknown tokens are capped globally per minute; past the cap the
  server answers 429 without calling Twitch. The owner's cached token never reaches the cap. A sustained flood of well-formed
  fake tokens could still delay a fresh owner sign-in until the flood stops; that is accepted, and the kill switch is the remedy. (my call)
- **First task of piece 1: prove the Authorization header reaches PHP on this host.** The web PHP here is the CGI build, where
  Apache often does not pass that header on. Deploy a throwaway probe through the real front controller before building on it.
  Fallbacks: a line in `.htaccess` that passes the header to PHP, or a custom header name. The router's preflight today
  allows only Content-Type and the methods GET, POST and OPTIONS, so admin paths extend it with the chosen header. Admin writes
  use POST, so no other methods are needed. Public paths keep today's rules.
- Twitch returns to PRISM's registered address (the site root), not to `/admin`, so the sign-in remembers the page it came
  from in `sessionStorage` and sends the owner back there afterwards.
- **No admin endpoint** returns config values (except a fixed short list of non-secret limits the screens display: the
  TwitchTracker day and run budgets, the new-channels cap and the tail days), returns secrets, runs code, reads
  files, or fetches an address on a caller's behalf and shows the result. This keeps the damage small if the owner's token is ever stolen.
  The admin token sits in `sessionStorage` (forgotten when the tab closes; revoked at Twitch on Sign out, otherwise valid until Twitch expires it, and the server may remember it as the owner's for up to 30 minutes more) and the server refuses PRISM's long-lived viewer token
  for admin, so an injected-script bug on a PRISM page could read a usable admin token only while the owner is signed in
  as admin; hence all playlist text is escaped and nothing is written into the page as HTML.

### Refused attempts: what is logged

| Request | Answer | What is recorded |
|---|---|---|
| No token, or a token Twitch calls invalid or expired | 401 | A count in today's "signed out" total, written under its own global per-minute cap (600 a minute, a separate count from `hit`, so a flood of page-open pings cannot hide signed-out attempts). No name, because none can be known. |
| A valid permission-less token issued to PRISM's app whose user is not the owner (someone who went through the admin sign-in) | 403 | A named row (below). |
| Any other valid token that is not accepted: one carrying permissions (a viewer's regular PRISM token) or one issued to another Twitch app. PRISM's pages never send these, so this is a script | 403 | A named row, flagged "not via the admin sign-in". The owner's own token of this kind is refused too, but not logged. |

The name always comes from Twitch's answer about the token, never from anything the caller sends. The log names the token's owner:
nearly always the person, but a stolen token would name its victim; the panel's wording says "token of".

**Table (my call on shape, owner's request for the feature).** One row per Twitch user, not per attempt: Twitch user id,
login as of the last attempt, first attempt, last attempt, attempt count, and whether any attempt was not via the admin
sign-in. No IP and no browser details. Rows whose last attempt is older than 90 days are deleted, the table is capped
(oldest dropped past 1,000 rows) so it cannot grow without bound, and the panel lists the rows. If PRISM ever gets a privacy
notice, it names this log.

**What a refused person sees (my call):** "This page is only for the site owner. Your Twitch name was recorded." The sign-in
screen already says this before they click, so nobody is logged without having been told.

### Audit list of admin changes

Every admin write (in piece 1: remove channel, unblock channel) records one row in the same database transaction:
time, action, target, a short detail. No IP. The Security screen shows the most recent 50; rows are kept 180 days (my call).
If someone ever used the owner's token, the owner would see a change they do not remember. Later pieces record their writes the same way.

### Usage counters

- **`hit` ping.** A new public endpoint accepts `{ section }` from PRISM's origins only, in a plain-text body so the browser
  sends no preflight, like the visit ping. The server adds one to that UTC day's count for that section. Allowed sections (my list, matched to
  PRISM's routes): `home`, `twitch`, `youtube`, `hls-dash`, `chat-popout`, `other`. Anything else is rejected, so the table
  stays tiny. The page never waits on it and ignores failures.
- Sent from **production builds only**, like the visit ping, so development machines do not add counts. **One page open = one
  client-side navigation that lands on a different path**, including a move from one channel to another and back or forward
  moves. A re-render of the same path, a repeated effect (React StrictMode) and a change that stays on the same path do not
  count; a full reload counts once as it loads. `/admin` is not counted, because it is the owner's tool; the not-found page
  counts as `other`. These rules are fixed now because stored counts cannot be re-bucketed later. (my call)
- Stored as one row per day and key in a new counters table (my call; the builder may move the existing `tt_calls` rows
  into it, with a back-fill).
- A global per-minute cap bounds a runaway script. Counts are **a floor** (ad blockers drop pings) and **inflatable** by a
  script, so they are advisory, never a basis for anything billed or decided automatically. They count page opens, not people.
- **New channels tracked** is its own counter, added to when a channel is first tracked, so removing a channel later does
  not rewrite past days. The Overview's "of the daily cap" figure instead uses the server's own rolling 24-hour count, the
  window the cap is enforced on, and is labelled "last 24 hours". (my call)

### Screens (admin layout C)

A menu down the left: Overview, Usage, TT calls, Security, Channels, then greyed Playlist and Health ("coming later").

- **Overview.** Four numbers: pages opened today (with the change from yesterday), new channels tracked (with the daily
  cap), TwitchTracker calls against the day budget, and refused attempts (named, plus signed-out). One 14-day chart of pages
  opened. A "Needs a look" box (my call): TwitchTracker calls paused after a 429, the scheduled job not having run in
  over eight hours, today's calls above 80% of the budget, and any named refused attempt in the last seven days. Later:
  dead streams.
- **Usage.** Pages opened per day and per week, split by section, over 14, 30 and 90 days, using the existing history charts.
- **TT calls.** Calls per day against the budget line, whether calls are paused (and until when), and the last scheduled
  run's time and counts (the builder stores these in job state if they are not already kept in a readable form).
- **Security.** The named refused-attempts list, today's signed-out count, and the recent-changes list.
- **Channels (my call).** The channels the server tracks, searchable: login, display name, status (tracking, dormant,
  gone), tracked since, last visited, latest TwitchTracker status. Actions: **Remove and block** (deletes the channel's rows
  and adds it to the blocked list, the same as `remove-channel.php`, after a confirm dialog that says it cannot be undone) and
  **Unblock**. It exists so the audit list and the admin write path get a real first user before the playlist depends on them,
  and it retires the SSH step. The script stays as a fallback.

### Needed from the owner at build time (piece 1)

The two `config.php` lines above, added by the owner, never pasted into chat. No new database, no new cron job, no new Twitch
app (the admin sign-in is a second, permission-less authorisation for the existing front-end app; the owner clicks Authorize
on Twitch's screen when signing in).

### Testing (piece 1)

PHP tests in Docker like the rest of the server, with Twitch faked: owner's permission-less token accepted; the owner's token
with permissions refused and not logged; non-owner permission-less token refused and logged; a viewer token with permissions or
a foreign client id refused and flagged; invalid or misshapen token counted unnamed with no Twitch call; cache honours expiry; the cap answers 429; rows purge at 90 days and cap at 1,000;
`hit` rejects unknown sections and respects the cap; admin endpoints never answer without a valid owner. Live acceptance (the
owner signs in; a second Twitch account is refused and named) needs the owner and a second account, since an agent cannot
sign in, so the plan marks those steps as owner-run. Front end: tests
for the sign-in states and each screen's loading, empty and error states. The server stays optional: with it down, the
admin route says so and every other page looks as it did before.

## Piece 2: playlist store, import and visitor list (decisions)

### The stored list

One row per stream, identified by the SHA-256 of its normalised address (scheme and host lower-cased, default port and
fragment dropped, query kept). Never by list position. Stored per stream: address, name, group names (split on `;`),
country (from the id's suffix, mapped where the code is not a standard flag code), kind (HLS or DASH), state (see piece 3),
pinned and default flags, source (import batch or manual), added, last checked, facts from the manifest (live or
on-demand, quality levels, caption tracks, audio languages, codecs, source host), and the file name of its logo copy.
A removed stream keeps its row as a tombstone so a re-import does not bring it back.

### Import (my call: a command-line script)

Import runs once or twice a year, so it is a script run over SSH after the file is uploaded by SFTP (like `install.php`),
not a panel upload. A panel upload can come later. The first run uses the media-demo copy. Rules:

- Only `http` and `https` addresses. Addresses carrying logins (`user:pass@`) or token-looking query values are rejected,
  because IPTV subscription links embed credentials.
- Entries with `#EXTVLCOPT` headers (user agent, referrer) are left out: browsers cannot send them and a server relay would be an open proxy.
- Any group matching adult-content terms is rejected, so a later re-sync cannot bring one in.
- `http://` entries are stored with the state "unplayable here" (an https page cannot load them).
- The group "Undefined" shows to visitors as "Other".
- Logos are fetched once through the same guarded fetcher as the checker (below), accepted only as PNG, JPEG, WebP or GIF
  (never SVG), size-capped, and served as PRISM's own copy. Missing or rejected logos show a letter tile.
- The iptv-org project's licence and credit requirements are checked by the builder and honoured in the page footer or About text.

### The visitor snapshot (my call)

After every checker run and every admin write, the server rewrites one compact file in its public folder (written to a
temporary name and renamed, so a visitor never reads half a file). It holds only listed streams: id, name, group indexes,
country, logo file name, a captions flag and kind. The page loads it once, filters and searches in the browser, and caches it
briefly. Files in the server's public folder are served straight by Apache, so a plain file would get no CORS header (whether the
header module is available is unverified). The snapshot is therefore served through the front controller, which reads the file
and sends it with the existing origin allowlist and an ETag. (my call)

### The HLS page

- **Layout (owner's choice).** Player on the left; the "About this stream" panel to its right; below, search, group pills and
  the channel list in a grid, with a country flag, a CC badge and the stream's state of health on each card.
- **Rendering.** Only visible cards are drawn (windowed list). Logos load lazily. This avoids media-demo's problem of mounting thousands of cards.
- **About panel (owner's description).** Opens each time a stream starts and folds away after 30 seconds. A slim tab at the
  player's edge reopens it. Large text (about 1.4 times the page's body size). A large channel picture, the country shown
  with a flag image (flag images, not flag emoji, because Windows does not draw flag emoji), group, live or on-demand,
  captions, quality levels, codecs, source host (never the full address, which can carry tokens), and "last checked, working".
  My details: the 30 seconds restart on hover or click inside the panel, a pin keeps it open, it respects reduced-motion
  settings, and it does not steal keyboard focus.
- **Default stream.** A "default" entry loads when the page opens. Until the trailer exists it is a public test stream.
- **Addresses.** Choosing a stream updates the page address to `/hls-dash/<id>` so the link can be copied. Pasted
  addresses keep working through `/hls-dash/custom?url=`. `resolveStreamSource` learns to look an id up in the snapshot.
- All names and text from the list are escaped everywhere.

### The Playlist screen in the panel

A table of streams with filters (state, group, country, text), add a stream (validated by the same rules as import), edit name
and groups, pin, set the default, and remove. Every write goes to the audit list.

### Piece 2 as built (2026-11-14; plan `docs/superpowers/plans/2026-11-14-playlist-piece-2-store-import-and-hls-page.md`)

Stages A (server), B (HLS page) and C (the Playlist screen above) are built. What differs from, or adds to, the text above:

- **The snapshot carries each stream's address** (`u`), which the field list above omitted: the page cannot play a stream
  without it. The About panel shows only its host. The other keys are `i` (public id), `n`, `g` (indexes into `groups`, most-used
  first), `c` (flag code), `l` (logo file), `k` (hls or dash), `p` (pinned), `s` (new, working, suspect); a captions flag is
  not in yet (piece 3). `GET /api/streams` sends an `ETag`, gzip when accepted, `max-age=300`, and 503 `not_ready` before the first
  import; the file lives in `<data_dir>` outside `public/`.
- **A stream's page address is `/hls-dash/<public id>`**, the first 12 hex characters of the SHA-256 of its normalised address
  (the full hash is the key). Demo ids (`apple-basic`, `bbb-hls`, …) and `/hls-dash/custom?url=` keep working.
- **The import only inserts.** A stream that is already known, edited or removed is never touched, so a re-import cannot undo
  the owner's work; a clash of the 12-character id stops it with nothing written. It also seeds the five demo streams (pinned,
  `working`; Big Buck Bunny is the default). `http://` streams are stored `unplayable` and streams on ports other than 80 and 443
  `held`: both are kept but not listed, so the first list is every https stream on a normal port, marked "unchecked".
- **Never stored:** a login in the address, a token-like query parameter, player options (`#EXTVLCOPT`, `#EXTHTTP`, `#KODIPROP`,
  `http-*` attributes), an address over 1,000 characters, an adult group.
- **Logos** are copied by their own resumable command (`fetch-logos.php`), through a fetcher that refuses private, loopback and
  link-local addresses at every redirect and accepts only PNG, JPEG, GIF or WebP by their first bytes.
- **Real numbers** (the media-demo list, 5,234 entries): 5,159 stored, 3 duplicate addresses, 58 with player options, 14 with token
  parameters, 1,169 `unplayable`, 483 `held`, 3,512 listed with the five demos; the snapshot is 673 KB (146 KB gzipped).
- **The page** plays the snapshot's default (else Big Buck Bunny) while the list loads, filters in the browser, mounts only the
  visible cards, and shows the built-in demo streams with a notice when the server is down, not ready or sends nothing usable.
- **The Playlist screen** (`/admin/playlist`, `src/components/admin/PlaylistScreen.tsx`; API in `server/src/Admin/PlaylistAdmin.php`)
  lists every stream in every state (50 a page) with filters for text, state and country, shows an address only as its host,
  and offers add (the import's rules; a refusal says which rule), edit (name and groups), pin, make default (only a stream
  visitors can see), and remove (a confirmation, then a tombstone: the row stays so a re-import cannot bring it back, and its
  logo copy is deleted). Every write is one transaction with its audit row and rewrites the visitor snapshot after the commit.
  A group filter exists in the API but not yet on the screen.
- **Play in place** (`src/components/admin/StreamPreview.tsx`; design `2026-11-14-playlist-stream-preview-design.md`): every
  stream that is not removed has a Play button that opens the stream page's player in a row under it (one at a time, closed by
  another page or filter, an edit, a removal, or a reload that drops the stream), with the kind and host, "Open in a new tab"
  (`/hls-dash/<id>` for a stream visitors can see, the pasted-address form for the rest) and the player's own error card.
  "Try as" changes the preview only. Nothing is saved from it; the checker (piece 3) decides states.

## Piece 3: the checker (decisions)

### States (my call; numbers are starting points)

new, working, suspect, dead, removed, and "unplayable here" with a reason (http, no CORS for PRISM).

- First check passes: working. A failed check on a working stream makes it **suspect**. A suspect stream stays listed and
  is rechecked in a few hours, so one blip does not hide it.
- Failures on **three different UTC days** make it **dead**, and visitors stop seeing it.
- Dead for **14 days** with no pass: **removed**. Removed rows are never hard-deleted by the checker; they are rechecked
  monthly and come back to working on a pass. The owner can delete rows from the panel.
- A stream with no CORS header allowing PRISM, or served over `http://`, is "unplayable here", not dead. It is hidden from
  visitors and rechecked weekly.
- **Host guard:** if more than half of a host's streams (with at least four checked) fail in the same run, none of those
  failures count; the host is probably down or blocking IONOS.

### What "working" means (owner's choice C, with the owner's earlier definition)

A valid manifest (`#EXTM3U` for HLS, an MPD root for DASH), a CORS header that allows PRISM's origin on the manifest and
on the first video chunk, and the first video chunk downloads. The checker presents `Origin: https://prism.nooroticx.tv` so
it sees what a PRISM visitor's browser would see.

### How a check works (my call)

- A scheduled job, with the same cron pattern as the refresh job, picks the streams that are due (oldest-checked first,
  suspect before others, then streams with a recent visitor failure report), up to a per-run cap, and spreads the first full
  pass over several days under a daily download budget. Starting points: a few hundred streams per run, a 256 KB cap per
  playlist, 8 to 10 seconds per request, at most one request per host per second.
- GET, not HEAD (many servers refuse HEAD). Redirects are followed manually, at most three, each re-checked.
- For HLS: fetch the manifest, fetch the first media playlist, then the first video chunk (reading no more than needed).
  Record live or on-demand, quality levels, caption tracks, audio languages, codecs, and whether the CORS header was present.
- **Guarding what it fetches (the one security-sensitive part).** Only `http` and `https` on ports 80 and 443. The checker resolves
  the name itself, refuses loopback, private ranges, link-local and cloud-metadata addresses, shared address space, and
  the IPv6 equivalents including IPv4-mapped forms, and connects to the vetted address (defeating DNS tricks). It repeats this on every redirect. It
  never returns what it fetched, and error details are not returned to callers. It identifies itself with its own user agent
  naming PRISM and the contact address from config. It never fetches Twitch or YouTube addresses.
- **Other ports.** 772 of the 5,234 addresses (15%) use ports other than 80 and 443 (1935, 1936, 8081, 19360, 8080 and
  others). The guard above allows only 80 and 443, so until the owner decides at piece 3's check-in whether to allow more,
  the import stores those entries as "unchecked: port", they are not listed, and the import reports their count. (my call)
- A kill switch and a per-run and per-day budget exist, like the TwitchTracker job.

### Visitor reports (my call on the endpoint)

A public endpoint accepts `{ id, outcome }` ("played" or "failed") from PRISM's origins. It adds to a per-stream, per-day
count, with a per-stream rate cap. It stores no visitor data. Its **only** effect on listing is to move a stream earlier in the
recheck queue (at most once per several hours per stream); it never changes a state by itself. Only streams chosen from the
list report; pasted addresses never do. The Health and Playlist screens show plays and fails per stream.

### The Health screen

Counts per state; the lists of suspect, dead, removed and unplayable streams with reason, last result and facts; actions
recheck now, restore, remove and pin; host-guard events; today's download budget used.

## Piece 4: player extras (decisions)

- **Captions.** Verify what Video.js 8's HLS engine already shows (in-band CEA-608 and WebVTT tracks named in the manifest),
  using streams the checker flags as captioned as the test material. Add a language picker, style settings (size, colour,
  background, edge) that are remembered in the browser, and the same for DASH through dash.js text tracks (to confirm).
  The CC badge in the list comes from the manifest facts.
- **Debug.** The existing stats panel moves behind a labelled "Debug" button. While there, remove the Twitch-only rows
  (Content ID, Parent) on HLS pages and the duplicate "Quality" row found in the earlier HLS review.
- **Trailer.** Made and hosted when the owner is ready (see "Trailer storage"), loaded as the "default" entry.
- This piece touches player files shared with a separate YouTube Live and chat effort (`PlayerHost.tsx`, `VideoJSPlayer.tsx`,
  `src/types/player.ts`, and possibly `SmartUrlInput.tsx`). **Expect a textual conflict and coordinate before starting.**
  Pieces 1 to 3 avoid those files.

## What success looks like

- After piece 1, the owner opens `/admin`, signs in as admin with Twitch, and sees today's page opens by section, new
  channels, and TwitchTracker calls against 1,500 at a glance; a different Twitch account that goes through the admin
  sign-in is refused and appears by name in Security; a removed channel appears in recent changes.
- After pieces 2 and 3, a visitor opens the HLS page and sees the demo stream playing and a list of streams that play; a
  stream that dies disappears within days without the owner touching anything, and returns if it recovers.
- After piece 4, a captioned stream shows captions with a CC badge in the list, and Debug is one labelled click away.
- No secret appears in the repo, at any address, or in a log. The only visitor-identifying data on the server is the refused-attempts log.
- Take the server down and PRISM looks as it did before this project.

## Later (not in this project)

Re-syncing from the iptv-org project's own data (richer metadata such as languages and categories); a panel upload for
imports; language and country filters; per-stream popularity ranking; M3U export; hover previews; a frame-grabbing thumbnail
(needs a frame grabber on the host); email or push alerts when TwitchTracker calls pause; a browser-side import with a
bundled worker.

## Risks and unknowns

- IONOS traffic limits, cron frequency limits, and image-library availability on PHP are unverified. The checker's download
  budget and the logo handling are sized to be safe without them.
- The first full check pass reads on the order of 5,234 playlists plus first chunks; the budget spreads it across days.
- A single IONOS datacenter cannot see geo-blocks or region differences; the host guard, the three-day rule and tombstones limit false removals.
- A stolen owner token (through an injected-script bug) is the main admin risk; the permission-less admin token (revoked on Sign out; otherwise it lives as long as Twitch lets it),
  the small admin surface and the audit list limit and reveal it.
- Unverified until piece 1's first task: that the Authorization header reaches PHP on this CGI-style host, and that Twitch's
  `force_verify` shows the authorise screen for an already-authorised app as expected.
- Logos are third-party artwork; PRISM serves small copies for identification only, and removal of a stream removes its logo.

## Left to the builder

Exact column types and indexes, endpoint paths and JSON shapes inside the above, how admin tokens are cached (database
table or other), the counters table design, whether `tt_calls` moves into it, the migration files, chart components and copy,
the flag image set, how the windowed list is built, how the snapshot is compressed, how the checker is scheduled (a second cron
entry or the same job), the exact thresholds under "starting points", and the layout details not shown above.

## My calls (for the owner to check while reading)

1. Admin kill switch `admin.enabled`, and the new config keys being optional with safe defaults.
2. Token handling: shape check before any Twitch call, caching the owner's validation for the shorter of the token's life and
   30 minutes, the global per-minute cap (a sustained flood of well-formed fake tokens can delay a fresh sign-in; accepted).
3. Refused-attempts table shape: one row per user, a "not via the admin sign-in" flag, 90-day purge, 1,000-row cap; "token of"
   wording; the refused person's message; the signed-out count under the same cap as `hit`.
4. Admin sign-in details: its token in `sessionStorage`, `force_verify` on the Twitch request, the server accepting only a
   permission-less token, and the sign-in remembering the page to return to.
5. A "page open" is one client-side navigation to a different path; `/admin` is not counted; the not-found page counts as
   `other`. "New channels tracked" is its own counter; the cap figure uses the server's rolling 24 hours; the admin API shows a
   fixed short list of non-secret limits.
6. Piece 1's first task is proving the Authorization header reaches PHP on this host.
7. Audit list: 50 shown, kept 180 days.
8. The section list: home, twitch, youtube, hls-dash, chat-popout, other.
9. The "Needs a look" triggers.
10. The Channels screen (Remove and block, Unblock) as the first admin writer.
11. Import by command-line script, with the import rules, including rejecting adult groups and credential-carrying addresses.
12. The visitor snapshot file (served through the front controller) instead of a paged API.
13. Our own copy of logos, accepted formats and no SVG.
14. State names, thresholds (3 days, 14 days, monthly tombstone rechecks), the host guard, and "unplayable here".
15. Entries on ports other than 80 and 443 (15% of the list) held back as "unchecked: port" until piece 3's check-in.
16. The checker's budgets and request limits.
17. About-panel timer details (restart on hover or click, pin, reduced motion).
18. Piece order, and one document for all four pieces.
