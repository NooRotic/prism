# PRISM history server — design

Date: 2026-11-12. Status: draft for owner approval. This is project 2 of three in
[the dashboards design](2026-11-11-twitch-dashboard-design.md) (project 1 = the dashboard, merged as #76/#77;
project 3 = user-submitted links, not started). The offline channel page it feeds is
[2026-11-11-channel-page-offline-layout-design.md](2026-11-11-channel-page-offline-layout-design.md).

## Intent and why

PRISM should be a one-stop place for data and video. Today a streamer who wants to look someone new up hops between
Twitch and TwitchTracker (TT). The owner could not name a wish list beyond "what TT shows", so the target is: open a
channel in PRISM and see both the stream and the numbers TT would have shown.

TT offers only two free API endpoints, both 30-day aggregates (`/api/channels/summary/<login>`,
`/api/games/summary/<id or name>`). It exposes no history. Any history therefore has to be built from PRISM's own daily
snapshots, which needs a small server that remembers. That server is this project.

## Goals

- Any channel someone opens in PRISM becomes tracked. Its TT 30-day numbers show at once on the channel page, and a
  history chart fills in day by day from the date tracking began ("tracking since <date>").
- One shared cache: the server asks TT at most once per channel per day. Visitors' browsers never ask TT about channels
  they only visit. (The existing browser call for a signed-in streamer's own channel stays as it is.)
- Growth over 7, 30 and 90 days (followers, rank, viewers, hours watched) computed from our own history.
- Each channel's YouTube and Kick links, read from its Twitch bio, kept for later features.
- Runs on the owner's existing IONOS Hosting Plus. No new paid services.

## Non-goals

- Not reproducing TT's pages. No subscriber counts, famous followers, per-stream tables, all-time stats or language rank.
- No live viewer sampling (a per-stream viewer curve). A strong later candidate; see "Later".
- No accounts, no stored user data, no visitor tracking.
- Never scrape a TT HTML page. Only the documented API endpoints.
- PRISM itself stays on GitHub Pages at `prism.nooroticx.tv`. It is not being moved.
- No user-submitted links (project 3).

## Anti-goals (a failure even if everything "works")

- Hammering TT or Twitch: bursts, ignoring a 429, retry storms.
- Leaking the Twitch client secret or the database login: committed, web-reachable, logged, or printed in an error.
- Storing anything that identifies a visitor beyond a short-lived hashed counter (see Trust model).
- Charts that pretend. A gap, a channel TT does not track, or stale data must look like exactly that.
- A database filling up with made-up channels.

## Constraints

- **Host.** IONOS Hosting Plus webspace. PHP 8.4 (verified 8.4.27, cgi-fcgi) with curl, openssl, json, pdo_mysql, mysqli,
  mbstring. MariaDB 10.11. There is no SQL console tool and no Node on the host. Cron is available (panel or SSH); its
  frequency and run-time limits are unverified. Outbound HTTPS to twitchtracker.com, api.twitch.tv and id.twitch.tv was
  verified from the host on 2026-11-12.
- **Address.** `https://prism-data.nooroticx.tv`, bound to `/prism-data/public` (verified: valid HTTPS, root files not
  served). Only `public/` is web-reachable. Everything else lives beside it.
- **Secrets.** Twitch client id and secret, the database login and a salt live in `/prism-data/config.php`, outside
  `public/`. The owner creates it. No agent reads or prints it. A `config.example.php` with placeholders is committed;
  the real file never is.
- **Deploy.** Password SFTP with `ssh2`, pinned host key, `IONOS_SSH_PASSWORD` from the environment or a gitignored
  `.env` (the recipe in the owner's `IONOS-SFTP-DEPLOY.md`; reference implementation in `inferno-map/modern-edition/tools`).
  Host, user and host-key pins come from a gitignored deploy config, never the repo. The deploy never uploads, reads or
  overwrites `/prism-data/config.php`. Whether SSH shell commands (not just SFTP) are allowed on the account is unverified;
  if not, the one-time installer runs from a guarded URL under `public/` and is deleted straight after.
- **Cross-origin.** The app is on `https://prism.nooroticx.tv` (and `http://localhost:5000` in development), the server on
  another origin. The allowed origins live in config. The allowlist only stops other websites' browsers; any script can fake
  the header, so the real defences are the Twitch check, the per-visitor limit and the global caps.
- **TT etiquette.** Own User-Agent naming PRISM plus a contact address, hard budget per run, stop on the first 429.
  TT's `robots.txt` disallows `/api/*` while its footer points users at this "basic API". The owner chose to use the
  documented API and is emailing TT; the budget and kill switch exist so it can be paused instantly.
- **Twitch.** App access token from the client-credentials grant, cached until it expires. Get Users and Get Channels
  take up to 100 logins or ids per call.
- **Testing.** No PHP on the dev machine, but Docker is installed. Tests run in `php:8.4-cli` and `mariadb:10.11`
  containers so they match the host versions. Pulling those images is a download the owner must approve first.
- **Code location.** A `server/` folder in the PRISM repo, outside the Vite build, with its own tests.

## Decided by the owner

- The server fetches TT itself. Browsers do not ask TT about channels they only visit.
- Daily snapshots build the history. Bio links are kept.
- **Tracking lifecycle (option B).** Once someone opens a channel it is tracked. The server refreshes it daily on its own
  until nobody has opened it for about 30 days. The 30 days is a tuning knob.
- **Trust model.** (1) A visit counts only if the login is a real Twitch channel, checked with Twitch. (2) One visitor can
  add only a few new channels per hour. (3) The server answers only PRISM's own origins. (4) It stores nothing about
  visitors. The Twitch client secret sits in a private file the owner creates.
- **No waiting on TT (2026-11-12).** The daily TT job is switched on at launch. The owner sends the courtesy email to
  contact@twitchtracker.com in parallel. A visible "Data: TwitchTracker" credit linking to the channel's TT page appears
  wherever its numbers are shown.
- The server lives at `prism-data.nooroticx.tv`. PRISM is currently free to use and has no ads.

## Design

### Identity
Channels are keyed by Twitch user id, not login. The login is "latest known". A visit arrives by login, is resolved with
Twitch, and updates the stored login if the channel was renamed. If Twitch no longer finds the channel it is marked gone
and stops being refreshed.

### Visit
`POST /api/visit` with `{ login }`, sent by PRISM to signed-in and signed-out viewers alike (production builds only, see
the front end) when a channel page opens. The page never waits on it and ignores
failures. The server:
1. Rejects anything not matching `^[a-z0-9_]{1,25}$`, and any blocked channel.
2. If the channel is known, updates `last_visited_at` (written at most once an hour per channel). If its login was last
   confirmed with Twitch more than a day ago, it re-resolves the login first, so a channel that was renamed, whose old
   login someone else then took, is not answered with the wrong row. The `login` column is therefore not unique.
3. If unknown, applies the per-visitor new-channel limit, asks Twitch, and inserts the channel only if it is real. A
   global cap on new channels per day is the backstop.
4. **Fetches TT on demand.** If TT may be called for the channel (the rule below), the visit calls it right then, so a first
   visit shows numbers in about two seconds. This holds for a known channel that has no snapshot for today as well.
5. Answers with the same payload as the read API, so the page needs one request.

**The one TT rule.** TT is called for a channel only if it has no `ok` snapshot for today's UTC date (an `error` snapshot
does not count). A channel last answered `untracked` is not asked again for 7 days. The scheduled job and the visit path
follow the same rule, so TT calls per channel per day never exceed one.

**The TT gate.** Every TT call, from a visit or from the scheduled job, passes one shared gate: a database lock records the
time of the last TT call and the next one waits until at least 1.5 seconds later. If a visit cannot get its turn within
about three seconds, it answers with the profile only and `tt_status: pending`, and the next visit or run fills the numbers
in. The kill switch, the 429 stop and the budgets below apply to every call, whichever path made it.

**Per-visitor limit.** It needs some key. The proposal is a salted hash of the client IP, kept as an hourly counter that is
deleted within two hours. No IP, user agent or any other visitor detail is stored. The owner approved "stores nothing
about visitors"; this short-lived hashed counter would be the one exception, and a hashed IP can still count as personal
data in some regions. **Open for the owner:** keep the counter and add a one-line privacy note to PRISM (recommended), or
drop the per-visitor limit and rely on the Twitch check plus the global cap. Which header carries the real client IP on
IONOS shared hosting is unknown; it is checked with a probe on the host before the limit is built.

**Numbers (my calls, all config values).** 5 new channels per visitor per hour. 200 new channels per day overall. TT calls
at least 1.5 seconds apart. At most 300 TT calls per scheduled run and 1,500 per UTC day in total, visit-triggered calls
included. Built for up to about 1,000 tracked channels (about 25 minutes of TT calls a day); beyond that, revisit.

### Scheduled refresh
A cron job runs every few hours; the exact frequency is bounded by the host's cron limit, which is still to be checked.
Every run is small and safe to repeat. Each run takes the channels visited within the tail window that still lack today's
snapshot, longest-unrefreshed first, up to the per-run budget. For each it:
- refreshes the Twitch profile (batched Get Users and Get Channels): display name, avatar, broadcaster type, language,
  current category;
- fetches the TT channel summary under the one TT rule and the shared gate;
- reads YouTube and Kick links out of the bio text;
- writes one snapshot row per channel per UTC date. Re-running the same day updates the row, so a rerun is safe.

Because a run only picks up channels that still lack a good snapshot for today, "retry" and "catch up" need nothing special:
a failed or unfinished channel is simply taken by the next run. TT answering `{}` records the day as "untracked" (TT does
not track that channel yet). A network error or non-200 records "error". The first 429 ends the run, is recorded, and
pauses all TT calls for the rest of that UTC day (or the `Retry-After` time if longer). If the host only allows one run a
day, the per-run budget becomes the daily capacity, which is enough at the stated scale.

### What is stored
- **channels**: Twitch id (key), login, display name, avatar url, broadcaster type, account created, language, current
  category, first seen, last visited, tracked since, status (tracking, dormant, gone). Dormant means the tail window passed with no visit and refreshing stopped;
  the next visit makes it tracking again, and the history shows the stretch in between as a gap.
- **snapshots**: (Twitch id, UTC date) key; TT `rank`, `minutes_streamed`, `avg_viewers`, `max_viewers`,
  `hours_watched`, `followers` (net 30-day change, can be negative), `followers_total`; `tt_status` (ok, untracked,
  error); `fetched_at`.
- **bio_links**: Twitch id, platform (youtube, kick), url, first seen, last seen.
- **blocked_channels**: channels removed on request, so they are not tracked again.
- **visit_limits**: hashed key, hour, count. Short-lived.
- **job state**: the cached Twitch token, the last run's counts (no secrets, no request bodies), and the on/off flags.

History is kept indefinitely (about 365 small rows per channel per year).

### Read API
`GET /api/channel?login=<login>&days=<n>` returns the profile (with its bio links), the latest snapshot, the daily history
(default 90 days, `days=all` allowed), `tracked_since`, `last_updated` and `tt_status` (ok, untracked, error, or pending
when the TT gate was busy). It is cacheable for a few minutes. An unknown channel answers 404 with `{ tracked: false }`;
the page then sends the visit, whose answer carries the same payload. Growth is computed from the history on the client or
at read time and never stored, and only for the two point-in-time series: total followers and rank.

### PRISM front end
- A `historyApi` client and hooks, and a new history block: the TT 30-day numbers with the credit, then charts (total
  followers, rank where lower is better, average and peak viewers, hours watched). It shows for **any channel the server
  tracks, to signed-in and signed-out viewers alike**, in the offline layout's existing stats slot and in the equivalent
  place on the live layout.
- **On the viewer's own affiliate or partner channel** the existing `StreamerBlock` stays exactly as it is: fresh browser TT
  numbers plus the three Twitch-sourced 30-day panels. The history block shows only its charts there, never a second row
  of TT numbers. `ThirtyDayPanels` and `useStreamerHistory` are kept, because they use Twitch's own per-day data, which the
  server cannot reproduce. On the dashboard, server history is added alongside them, not instead of them.
- **The charts say what TT's numbers are.** `avg_viewers`, `max_viewers`, `hours_watched` and `minutes_streamed` are each a
  trailing 30-day figure, not a daily one. Their charts are titled "rolling 30 days" and never read as daily values. Only
  total followers and rank are point-in-time. Growth over 7, 30 and 90 days is shown for those two only; the rolling
  figures get a trend line and no growth percentage.
- Fewer than two points shows the numbers only plus "tracking since <date>". A gap in the snapshots is drawn as a gap. Data
  older than two days carries a stale badge. A channel TT does not track reads "TwitchTracker does not track this channel
  yet".
- Visit pings are sent from production builds only. A development build (localhost) reads but never writes rows, so a dev
  machine cannot fill the production database. A flag can switch them on for a deliberate test.
- The server is optional. If it is down or slow, every page behaves as it does today.

### Operations
- **Kill switches.** Config flags turn the TT job and the visit endpoint off without a redeploy.
- **Budget.** Hard caps on TT calls per run and per UTC day (visit-triggered calls count), one shared gate spacing every
  call, and a stop on the first 429.
- **Logs.** Counts and statuses only, in a file outside `public/`. Never a secret, never a request body.
- **Install.** A one-time, idempotent script creates the tables. It is uploaded, run once, then deleted, because there is
  no SQL console. Later changes ship as numbered migrations through the same runner.
- **Removal.** A streamer can ask to be removed. A script run by the owner deletes the channel's rows and adds it to
  `blocked_channels`.

## What success looks like

- A first visit to a never-seen channel shows the TT numbers within about two seconds.
- A week later its follower chart holds a week of points, and the channel kept refreshing even though nobody reopened it.
- TT calls per day equal the number of tracked channels, never more.
- No secret appears in the repo, in a log, or at any URL.
- Take the server down and PRISM looks the same as it did before this project.

## Later (not in this project)

- **Live viewer sampling.** Poll Twitch's live-streams endpoint for tracked channels every few minutes to build our own
  per-stream viewer curves and exact peak and average numbers. Needs cron every five minutes or faster, so the host's
  cron limit has to be checked first.
- TT game summaries for category pages (the email already mentions it).
- CSV export of a channel's history.
- Next-stream schedule on the offline page, from Twitch's public schedule endpoint, browser side, no server.

## Left to the builder

Exact column types and indexes, endpoint paths and JSON shapes within the above, the migration runner, the PHP structure,
how cron is scheduled (panel or SSH crontab), CORS preflight details, how often the client repeats a visit ping, chart
components and copy.

## Needed from the owner, at build time

- Create the new database in the IONOS panel.
- Create `/prism-data/config.php` (Twitch client id and secret, database login, salt, allowed origins). Never pasted into
  chat.
- OK to pull the PHP and MariaDB Docker images for tests.
- Create the scheduled cron job in the panel (every few hours, within the host's limit), or OK for it to be set over SSH.
- Send the TT email.
