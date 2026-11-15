# Playlist piece 3a: the stream checker (design)

Date: 2026-11-14. Status: APPROVED by the owner on 2026-11-15, with one amendment (see "Removals" below). A fresh-reader check found ten gaps; they are resolved below and listed
under "Calls to confirm"). Parent spec: `2026-11-13-playlist-admin-design.md` (its "Piece 3: the checker (decisions)" section).
Where this document differs from that section, this document wins; the differences are listed at the end. Piece 3 is split in
two: **3a** (this document: the checker, its states, the shadow run and Apply, a minimal Health screen, the checker's public page)
and **3b** (later: the full Health screen with actions, and the visitor-reports endpoint).

## Intent

The playlist holds about 3,500 streams visitors can see, copied from a list the owner's other project curated. Some are dead,
some are slow, some will die next week. Today nothing notices. The checker is a scheduled job on the history server that plays
each stream's first moments the way a PRISM visitor's browser would, hides the streams that fail, and brings them back if they
recover. The owner should not have to look at it, except once, to approve the first pass.

Success, in the owner's words: after the first pass the public list is only streams that played ("keep the whole playlist
working"); a stream that dies later disappears within days without the owner touching anything, and returns if it recovers.

## Goals, non-goals, anti-goals

**Goals**
- Visitors see only streams that played recently, with the demo streams and the owner's pins handled as decided below.
- The first full pass over the list finishes in one sitting (estimated 40 to 60 minutes with 6 workers; unmeasured), is reviewed by
  the owner as a **shadow run** that changes nothing visitors see, and is then applied with one button.
- A daily recheck of every listed stream, with the timings in "States, visibility and timing".
- A stream owner who sees the traffic can find out who is calling and ask for removal, without the PRISM owner's email being sent to
  thousands of strangers.

**Non-goals (3a)**
- Visitor reports (`POST` of played/failed from the page) and the full Health screen actions (recheck now, restore, remove): 3b.
- Checking `http://` streams (they cannot play on an https page) or any address on a port below 1024 other than 80 and 443.
- Checking more than the first variant of a master playlist, or DASH segments (see "What a check does").
- Reading captions, languages or codecs into the UI: the checker only records the facts (piece 4 uses them).

**Anti-goals** (would make this a failure even if it technically works)
- A fetcher that can be aimed at the server's own network (the guard from piece 2 stays; see "Guarding what it fetches").
- A check that returns, stores or logs text from the other side, an address, or the owner's contact details.
- A checker that hides a good stream because the checker's own network was bad that day.
- A hidden decision about what visitors see: nothing visitors can see changes before the owner presses Apply.

## What the owner decided (check-in, 2026-11-14)

1. **Ports.** The checker may contact HTTPS on 80, 443 and any port from 1024 up, except the ports browsers refuse (Chromium's
   restricted-port list; the builder copies the current list and notes its source). `http://` is never checked.
2. **First pass is a shadow run, then Apply.** Every result is recorded, nothing visitors see changes. The owner reviews the counts
   and presses Apply once. Apply hides every stream that failed its first check at once (no three-day wait: "this is the initial
   creation"); each is rechecked another day and returns when it passes.
3. **A failing default or pinned stream is hidden like any other**, and its pin and default setting are kept; the page falls
   back to the demo default meanwhile.
4. **Recheck daily** (see the timing table).
5. **Identification:** the user agent names PRISM and links to a small page on `prism.nooroticx.tv` that says what the checker does
   and how to ask for a stream's removal through the repository's GitHub issues. No personal email goes out.
6. **Parallel workers** on cron (see "How a run works").

## Calls to confirm (mine, not yet the owner's)

Beyond the six decisions above, these are my calls, made while writing this and while resolving the reader's questions:

- `new` streams stay listed until first checked (the owner's own additions appear at once and are checked first).
- A stream that never passed goes straight to `dead(never_passed)` after a failed first check (and one retry); the three-day rule
  protects only streams that passed once.
- **The host guard protects only streams that passed once** (`ever_passed`). On the first pass failures count even on a big host,
  because the list is concentrated: 152 hosts carry 1,617 of the 3,512 streams (46%), and a guard that applied to never-passed
  streams would leave nearly half the list "unverified and visible". The shadow run is where the owner sees the damage first: the
  Health screen lists every host with at least four streams where more than half failed, with the number of streams, before Apply.
- Pinned and default streams are never auto-removed (the tombstone step clears the pin).
- A checker-made tombstone is distinguishable from the owner's (`removed` with reason `dead_14_days`); the checker never touches an
  owner removal.
- CORS is judged hop by hop the way a browser does it, and a once-working stream that loses CORS gets the suspect grace.
- DASH is checked at manifest level only; HLS checks only the first variant.
- The first pass has its own download cap; the daily cap starts after Apply.
- The public page is a static file, not a route in the app.

## Approaches considered (how the run is built)

- **A. Sequential batches on cron** (the parent spec's idea): simplest, reuses the guarded fetcher as it is. The first pass is
  about 4 hours of one-at-a-time crawling, and so is every day after it.
- **B. `curl_multi`** (many requests at once in one process): fastest, but the fetch loop (name lookup, vetting, address pinning,
  redirects) would have to be rewritten in asynchronous form. It is the one security-sensitive piece, and there would be two copies.
- **C. Parallel workers (chosen by the owner).** Several worker processes, each owning the streams whose host falls in its slice.
  Every worker uses the existing sequential fetcher (plus request headers and per-hop results). The host guard stays local to one
  worker, because a host's streams are never split across workers. If the host allows only one process at a time, the worker count
  drops to 1 and this is approach A.

## States, visibility and timing

Visitors see `new`, `working` and `suspect` (unchanged: `StreamStore::LISTED`). The states exist already (`streams.state`); the
checker adds meaning and reasons.

| State (reason) | Visible | Meaning | Rechecked |
|---|---|---|---|
| `new` | yes | never checked (an owner-added or imported stream) | next run, before everything else |
| `working` | yes | passed its latest check | daily |
| `suspect` | yes | was working, latest check failed | about every 6 hours |
| `dead` (`never_passed`) | no | failed its first check (after the retry) | daily |
| `dead` (`failed_3_days`) | no | was working, failed on three different UTC days | every 2 days |
| `unplayable` (`no_cors`) | no | never passed and answered without a CORS header allowing PRISM | weekly |
| `held` (`awaiting_check`) | no | a stored stream whose port the new rule allows, not yet checked | first pass |
| `removed` (`dead_14_days`) | no | the checker's tombstone: dead for 14 days with no pass | monthly (a pass brings it back to `working`) |
| `removed` (any other reason, `NULL` included) | no | the owner removed it | never |
| `unplayable` (`http`), `held` (`port`) | no | http, or a port the rule refuses | never |

"Daily" means 24 hours after the previous check (`next_check_at`), not a calendar day. A failure counts toward "three different
UTC days" by the UTC calendar day of the check that failed; several failures on one UTC day count once.

**Removals (the owner's amendment at approval, 2026-11-15: "after first check, removals can be checked & revived").** After the
first pass, a stream the checker hid or removed is rechecked (daily while `dead`, monthly once `removed(dead_14_days)`) and returns
to `working` on a pass. My reading, to confirm: this covers the checker's removals. A stream the owner removed with the Remove
button is not rechecked, because bringing back something deliberately removed (for example an unwanted channel) after a month
seems the wrong default; the Health screen's restore action (3b) is how the owner brings one back. If the owner meant their own
removals too, it is a one-line change in the due-stream rule (treat a `NULL` reason like `dead_14_days`) and a task note.

**Transitions after Apply** (each check's result is one of the fixed codes in "What a check does"):
- **Pass:** any checked state, including `removed(dead_14_days)` and `held(awaiting_check)`, becomes `working`; the failure count
  resets; `ever_passed` is set.
- **Fail** (after the in-run retry): `new`, `held(awaiting_check)` or `dead(never_passed)` becomes or stays `dead(never_passed)`;
  `working` becomes `suspect` (that day is failure day 1); `suspect` counts a failure only on a different UTC day from the last
  counted one, and the third such day makes it `dead(failed_3_days)`.
- **No CORS** (any response in the chain, see "What a check does"; also retried once in the run): a stream that never passed
  becomes `unplayable(no_cors)`; a stream that passed once is treated as a failure above (one CDN edge that omits a header once
  must not hide a good stream for a week). `unplayable(no_cors)` followed by an unreachable result stays as it is.
- **Removal:** `dead` for 14 days with no pass becomes `removed(dead_14_days)`, **except a pinned stream or the default stream**,
  which are never auto-removed (the stream stays `dead`, rechecked every 2 days, flagged on the Health screen): the tombstone step
  clears the pin and the default flag. An auto-removal also deletes the stream's logo copy, as the owner's removal does.
- **Hidden default:** `SnapshotWriter` already takes the default from the listed rows only, so a hidden default means the page uses
  the demo default. Test it; the checker never touches the flag.
- **Compare-and-set:** a worker writes a transition only if the row is still in the state it read (the owner may have removed,
  pinned or edited it mid-check); otherwise it drops the result.
- **Host guard (streams that passed once only):** if more than half of one host's streams fail in one run (the host has at least
  four streams checked in that run), none of the failures of streams with `ever_passed` count: the result is recorded as `host_guard`
  (no information), the state is unchanged, and the Health screen lists the host. Streams that never passed are not protected:
  their failures count. The guard exists to stop one bad day at a host from demoting streams that were good.
- **Run guard:** a worker keeps a rolling window of its last 50 checks. If two thirds or more failed (a third fail on a normal day,
  so the checker's own network is the likely cause), the worker stops, marks those last 50 results `voided` (treated as not
  checked, so they are tried again) and records that it stopped. Results before the window stand.
- **Skipped:** hosts in a small deny list (Twitch and YouTube families: `twitch.tv`, `ttvnw.net`, `jtvnw.net`, `youtube.com`,
  `youtu.be`, `googlevideo.com`, `ytimg.com`, and their subdomains) are never fetched; result `skipped`, state unchanged. No stream
  in today's list is on them; the rule is for streams added later.

## Shadow run and Apply

- Before Apply, every check is recorded (result code, time, facts, bytes) and **no `state` changes**. The snapshot is not rewritten.
  Results are written one stream at a time as they complete (a crash loses nothing, and the Health screen's progress moves).
- Before Apply only `--first-pass` runs are scheduled, so no stream is checked more than once per UTC day and the latest result
  wins. The steady cron is enabled after Apply.
- The state machine is one pure function `(row, result code, now) -> new state + reason`, used by both live runs and Apply, so what
  Apply does is exactly what a live run would have done. The guards decide a result code before the function runs (`host_guard`,
  `voided`, `skipped` mean "no information").
- **Apply** (button on the Health screen, `POST /api/admin/checker/apply`, owner only): in one transaction, runs the state machine
  over each stream's recorded first-pass result, writes an audit row (`checker.apply`, with the counts), stores the time in
  `job_state` (`checker_applied_at`), and then rewrites the visitor snapshot. After that, runs apply their transitions live.
- Apply **refuses** while any eligible stream has no recorded result (any code counts, `host_guard` and `skipped` included), when a
  result is older than 3 days (run again), and when two thirds or more of the results are failures (the run guard's reason). The
  screen says why and shows the progress. Apply is idempotent: a second press changes nothing and says so.
- The first pass checks every stream in `new`, `working`, `suspect` and `held(awaiting_check)` once. A failed check is retried once
  in the same run, at the end of the worker's batch (later, so a short outage has had time to clear), before the failure is
  recorded. In first-pass mode the "batch" is the worker's whole slice, processed in order, with results written as they come.

## What a check does

Per stream, GET only (many servers refuse HEAD), always sending `Origin: https://prism.nooroticx.tv` (config
`playlist.check_origin`, that value by default) so it sees what a PRISM visitor's browser sees:

1. Fetch the manifest. It must answer 2xx. For HLS the body must start with `#EXTM3U`; for DASH it must be an `MPD` root.
2. HLS only: if it is a master playlist, take its first variant and fetch that media playlist (it must also start with `#EXTM3U`);
   resolve relative addresses with `SafeFetcher::resolveLocation()`.
3. HLS only: fetch a media segment with `Range: bytes=0-65535`: the first, or the second when the playlist is live (no
   `#EXT-X-ENDLIST`) and has at least three, because a live playlist's first segment is the one about to expire. It passes when
   the answer is 200 or 206 with at least one byte. At most 64 KiB is read; **a cut at 64 KiB is a pass** (a server that ignores
   `Range` and sends the whole segment is normal). This is a different transport mode from the playlist reads: no
   `CURLOPT_MAXFILESIZE` for it, the cut is by the write callback, and `too_large` is reserved for playlists. DASH streams are
   checked at manifest level only (about 16 of the 3,512; segment discovery from an MPD is its own piece of work).
4. **CORS, hop by hop, as a browser does it.** Every response in the chain (each redirect, the manifest, the media playlist, the
   segment) must carry `Access-Control-Allow-Origin` of `*` or exactly the sent origin. The first request and same-origin hops send
   `Origin: https://prism.nooroticx.tv`; after a cross-origin hop a browser sends `Origin: null`, so the checker does too, and then
   only `*` or `null` passes. `SafeFetcher` therefore returns the status and headers of every hop, not just the last response.
5. Record the facts the later pieces need, without interpreting them: live or on demand, number of variants, codecs, caption and
   subtitle tracks, audio languages, in `facts_json`.

Fixed result codes (never text from the other side, never an address): `pass`, `no_cors`, `unreachable` (name, connect, TLS or
timeout), `http_status`, `not_playlist`, `no_variant`, `no_segment`, `segment_failed`, `too_large` (a playlist over its cap),
`insecure` (a hop to `http://`: a browser blocks it on an https page), `blocked` (the guard refused an address), `redirects`,
and the no-information codes `host_guard`, `voided`, `skipped`.

Limits (starting points, config): 8 seconds per request and a total of 30 seconds per stream (name lookups through
`dns_get_record` have no timeout of their own, so the total is checked between steps and a slow name can still overrun it),
256 KB per playlist, 64 KiB per segment, at most 3 redirects (each vetted again), at most one request a second to any one
**stream host** (not to every host contacted: a shared CDN host may see more than that from several workers, and the public page
says so), a **first-pass download cap** of about 4 GB (config `checker.first_pass_cap_mb`), a **daily cap after Apply** of about
1 GB, both counted in bytes read from the network, after decompression, in `job_state`, and a kill switch (`checker_paused` in
`job_state`, set by the command line and shown on the Health screen). Hitting a cap stops the workers until the next UTC day (the
first-pass cap leaves Apply refused until the pass completes).

## Guarding what it fetches (the security-sensitive part)

`SafeFetcher` and `CurlPinnedTransport` stay the only way the checker touches the network. Today they allow http and https on ports
80 and 443 only, and return the last response's headers. Changes: they take a **policy** (allowed schemes and ports; the logo copier
keeps today's policy exactly, the checker's is https only, ports 80, 443 and 1024 up minus the restricted list); the transport
takes request headers (`Origin`, `Range`) and a no-size-limit mode for the segment; `SafeFetchResult` carries the status and
headers of every hop. Everything else is as piece 2 built it: the name is resolved here, every answer must be a public address,
the connection is pinned to the vetted address, every redirect is vetted again, and a failure is a fixed code. (Piece 2 has no
Twitch or YouTube rule; the deny list above is new and lives in the checker, not in the fetcher.) The checker's output (command
line, logs, admin API) is counts and codes only.

## How a run works

- `bin/check-streams.php` (command line only, like `fetch-logos.php`) is run by one cron entry. It takes one named MariaDB lock for
  the whole launch (`RunLock`, a new name), so runs never overlap and a change of worker count between runs cannot let two
  generations touch the same hosts. With `checker.workers` greater than 1 it starts that many `bin/check-worker.php <k>/<n>`
  processes (`proc_open`) and waits for them; if that is not available on the host it runs worker 0 of 1 in the same process.
  Worker count, batch size and schedule are config and cron values, not code. The first sitting starts with 2 workers (the host's
  limits are unverified) and goes to 6 only after that works.
- A worker owns the streams for which `MOD(CRC32(host), n) = k` (a `host` column, filled by the migration and set on insert).
- Due streams are taken in this order: `new`, `suspect`, then the oldest `last_checked_at`; the order is interleaved across hosts so
  a host with 92 streams is not hit 92 times in a row.
- A worker rewrites the visitor snapshot (`SnapshotWriter::write()`, an atomic rename) at the end of a run in which the listed set
  changed, and only after Apply.
- Tests need no network: the transport is already an interface (`PinnedTransport`) with fakes.

## Admin and public screens

- **Health screen** (`/admin/health`, a new screen beside Playlist): first-pass progress (checked / eligible) and the age of the
  oldest result; the pending outcome (how many streams Apply would hide, by result code); the **host clusters**
  (hosts with at least four streams where more than half failed, with their stream counts) so the owner can judge geo-block or
  outage cases before pressing Apply; counts per state; flagged streams (pinned or default and failing, auto-removal withheld);
  guarded hosts; bytes today against the cap; paused or running; the **Apply** button with its refusal reasons. The lists of dead,
  removed and unplayable streams are the Playlist screen's existing state filter, which the Health screen links to. Playlist rows
  also show the last check time and result code.
- `GET /api/admin/checker` (status and counts), `POST /api/admin/checker/apply`, `POST /api/admin/checker/pause` and `/resume`.
  Same admin guard, audit rows and snapshot rewrite as the Playlist API.
- **Public page: a static file** `public/stream-checker/index.html` (copied into the build as it is), not a route in the app: the
  host serves single-page-app addresses as an HTTP 404 with a redirect stub (`public/404.html`), and an operator's script needs a
  plain 200 with the text. It says what the checker is, what it does (reads a stream's playlist and its first few kilobytes of video
  once a day, with an `Origin` header naming PRISM, at most one request a second to a stream's own host, stores only pass or fail),
  and how to ask for a stream to be removed (a link to new GitHub issues on `NooRotic/prism`, public with Issues enabled). The user
  agent is `PRISM-StreamChecker/1.0 (+https://prism.nooroticx.tv/stream-checker/)`, overridable by config
  (`playlist.check_user_agent`, with the same plain-text rules as `playlist.user_agent`).

## The port change touches existing code

- `ImportRules::stateOf()` today stores any explicit port other than 80/443 as `held(port)`. It becomes a shared public rule (the
  importer, the owner's Add and the re-judge command all use it): https on 80, 443 or an allowed port from 1024 up is `new`; http
  stays `unplayable(http)`; the rest stays `held(port)`.
- 483 stored rows are `held(port)` today. The importer is insert-only (it never revives or overwrites), so a separate, idempotent
  command (`bin/rejudge-held.php`, dry run by default) moves the rows the new rule allows to `held(awaiting_check)`, with an audit
  row. They stay hidden, so running it before the shadow pass exposes nothing; the first pass checks them, and a pass makes them
  `working`.
- `StreamStore` gains the checker's reads and writes (due streams, record result, compare-and-set transition) and the new columns
  (migration `004`, builder names them: at least `host`, `ever_passed`, `fail_days`, `last_fail_day`, `check_result`,
  `state_changed_at`, `next_check_at`; `last_checked_at` and `facts_json` exist). The migrator runs plain SQL, one statement at a
  time, so the `host` backfill is a SQL expression and every `ALTER` is re-runnable (`ADD COLUMN IF NOT EXISTS`). The visitor
  snapshot contract does not change.
- The parent spec's "Other ports" paragraph and `server/README.md` are updated when this is built.

## Rollout (each live step needs the owner's go)

1. Migration `004` and deploy (no behaviour change). 2. `rejudge-held.php --dry-run`, then for real. 3. Probe the host: how many
cron entries and simultaneous PHP processes IONOS allows (start with 2 workers). 4. The shadow first pass, in one sitting.
5. The owner reviews the Health screen, presses Apply. 6. Enable the steady cron. 7. Remove the logo copier's cron line when its
work is done.

## What is left to the builder

Column names and types; the exact SQL for the due-stream queue and its interleaving; the restricted-port list's source and format;
how a worker stops cleanly on its limits; the Health screen's layout (match the Playlist screen); the wording of the public page;
test fixtures. The plan will likely be one plan of 12 to 15 tasks (policy, headers and per-hop results; result codes and state
machine; store and migration; check logic; worker and launcher; apply and admin API; Health screen; static page; rejudge command;
rollout notes).

## Risks and unknowns

- **IONOS limits** on simultaneous PHP processes and on the number of cron entries are unverified; the worker count is the knob.
- **Bytes and time per check are unmeasured** (about a third of streams burn the 8-second timeout, and name lookups have no timeout
  of their own); the shadow run records both so the caps and the batch size can be tuned. Sample of 60 streams on 2026-11-14 (run
  from the owner's machine, not the host): 65% passed end to end, 35% failed, and every host that answered a playlist allowed
  PRISM's origin.
- **One datacenter cannot see geo-blocks.** A stream blocked for the host's region looks dead though it plays for visitors, and on
  the first pass the host guard does not protect it (see "Calls to confirm"). The Health screen's host clusters are the review;
  3b's visitor reports and restore action are the later answer.
- **The host guard can leave a once-good dead host's streams listed** (their failures are never counted). Accepted; the Health
  screen names the guarded hosts.
- **A transient failure on the first pass hides a good stream for a day** (it is rechecked daily and returns). The in-run retry at
  the end of the batch is the mitigation.
- **Only the first variant** of a master playlist is checked; a stream whose other variants fail still passes.
- **A re-import or the owner's Add lists unchecked `new` streams at once** (until their first check, within a run).

## Differences from the parent spec's piece 3 section

- Ports: any HTTPS port from 1024 up minus the browser-restricted ones, not 80 and 443 only (the "Other ports" paragraph).
- First pass: one sitting, with a shadow run and Apply, not spread over several days under a daily budget.
- A stream that never passed is hidden after one failed check (and one retry); the three-day rule protects streams that passed.
- The host guard protects only streams that passed once.
- CORS must hold on every response in the chain, judged hop by hop; "no CORS" on a once-working stream is a failure with the suspect
  grace, not an immediate `unplayable`.
- Pinned and default streams are never auto-removed; the checker's tombstone is distinct from the owner's.
- "It never fetches Twitch or YouTube addresses" becomes an explicit deny list in the checker.
- The daily download cap and the kill switch stay; the first pass has its own cap, and only the multi-day spread goes.
