# PRISM history server

A small, dependency-free PHP 8.4 service that remembers daily TwitchTracker snapshots for every channel PRISM
visitors open. Design: [docs/superpowers/specs/2026-11-12-history-server-design.md](../docs/superpowers/specs/2026-11-12-history-server-design.md).
Plan: [docs/superpowers/plans/2026-11-12-history-server.md](../docs/superpowers/plans/2026-11-12-history-server.md).

`server/` mirrors the host: its contents upload to `/prism-data/` on the IONOS webspace
(`server/public/` becomes `/prism-data/public/`, the only web-reachable part). The real `config.php`
(Twitch secret, database login) is created by the owner on the host, never committed, and never read by tooling.

## Deploy

`node server/tools/deploy.mjs` lists what would go to the host; add `--go` to upload over password SFTP (pinned host
key, `IONOS_SSH_PASSWORD` from the environment or a gitignored `.env`; options `--config` and `--env-file`). It never
uploads `config.php`. Classes go up first and `public/` last, so a request during an upgrade never meets a new front
controller with old classes. It only adds and replaces files: a file you remove from `server/` stays on the host until
you delete it by hand. Unlike the owner's inferno recipe there is no scp fallback: without a password it stops with a
message.

## The admin side and the usage counters

Design: [docs/superpowers/specs/2026-11-13-playlist-admin-design.md](../docs/superpowers/specs/2026-11-13-playlist-admin-design.md)
(piece 1). The tables come from `migrations/002_admin.sql`, applied by `bin/install.php` like the first schema.

- **Usage counters.** `POST /api/hit` with a plain-text JSON body `{"section":"twitch"}` (sections: `home`, `twitch`,
  `youtube`, `hls-dash`, `chat-popout`, `other`) adds one to that UTC day's count: 204, or 400 / 413 / 429. A global cap of
  600 a minute bounds a runaway script. No visitor data is kept; the counts are a floor and can be inflated, so they inform
  the owner and decide nothing. Each new tracked channel is also counted per day (`new_channels`).
- **The admin API** (`/api/admin/*`: `session`, `overview`, `usage`, `tt`, `security`, `channels`, `channels/remove`,
  `channels/unblock`) answers only the owner. The request carries `Authorization: Bearer <Twitch token>`; the server asks
  Twitch who it belongs to and accepts it only if the user is `admin.owner_twitch_id`, the token was issued to
  `admin.frontend_client_id` (PRISM's own app) and it has **no scopes**. Everything else is refused: a valid Twitch user who is
  not the owner is written to `admin_attempts` by name (the one thing the server remembers about a person; purged after
  90 days, 1,000 rows at most), and the owner's own wrong kind of token is refused without a record.
- **Config.** Add to `/prism-data/config.php` (neither value is a secret; `config.example.php` has the block):
  `'admin' => ['owner_twitch_id' => '<numeric id>', 'frontend_client_id' => '<VITE_TWITCH_CLIENT_ID>']`. `bin/twitch-id.php
  <login>` prints a login's numeric id. Until both are set, or with `'enabled' => false`, every `/api/admin/*` path answers
  404; a wrong value switches the admin side off and never breaks the public API.
- **Changes the owner makes** (Remove and block, Unblock) are written to `admin_audit` in the same transaction as the change.
  `bin/remove-channel.php` stays as a fallback.
- **Deploy order.** `deploy.mjs --go`, then straight away `/usr/bin/php8.4-cli prism-data/bin/install.php` (expect
  `applied 002_admin`). A visit never fails in between: the new-channels counter swallows its own errors.

## The playlist (piece 2)

Design: the same spec, "Piece 2" and "The HLS page". The table comes from `migrations/003_streams.sql` (applied by
`bin/install.php`: expect `applied 003_streams`). One row per stream, keyed by the SHA-256 of its normalised address
(scheme and host lower-cased, default port and fragment dropped); the page address uses the first 12 characters
(`public_id`). **States:** `new` (not checked yet), `working`, `suspect` are shown to visitors; `dead`, `removed`
(a tombstone, so a re-import cannot bring it back), `unplayable` (an `http://` address: an https page cannot load it, reason
`http`) and `held` (a port the checker may not use: below 1024 other than 80 and 443, or one browsers refuse; reason `port`)
are kept but never shown. The stream checker (below) moves streams between `new`, `working`, `suspect`, `dead` and `removed`.

- **`GET /api/streams`** (public, origin allowlist, `ETag`, `Cache-Control: public, max-age=300`, gzip when accepted, 304 on a
  matching `If-None-Match`, 503 `{"error":"not_ready"}` until the first import) answers the visitor snapshot:
  `{"v":1,"generated":"…Z","default":"<public id>","groups":["Other",…],"streams":[{"i":"<public id>","n":"name","g":[0,2],
  "c":"us","l":"<public id>.png","k":"hls","p":1,"s":"new","u":"https://host/path.m3u8"}]}`. Streams are pinned first, then by
  name; `g` indexes `groups` (most-used first); `l` is served at `/logos/<file>`; readers ignore fields they do not know.
  The file is written as `<data_dir>/streams.json` and `.gz` (default `/prism-data/data/`, outside `public/`) through a
  temporary name and a rename, and is rewritten after every import and every logo run.
- **Import** (the owner's media-demo list, about 5,200 entries; read-only source, copied up by SFTP, never edited):
  `/usr/bin/php8.4-cli prism-data/bin/import-playlist.php prism-data/data/import/HLS_valid.m3u [--dry-run] [--batch=<name>]`
  prints `key=value` counts (`entries inserted already_known duplicates rejected_* unplayable_http held_port demos`) and, for a
  real run, `snapshot streams=<n>`. **It only inserts**: a known stream (even one that was renamed or removed) is never
  touched, so re-running is safe and a new list adds only what is new. It seeds PRISM's five demo streams first (pinned,
  `working`; Big Buck Bunny is the default) and the whole run is one transaction (a clash of the 12-character public id
  stops it, loudly, with nothing written). **Never stored:** an address with a login, a query parameter named like a
  token, an entry with player options (`#EXTVLCOPT`, `#EXTHTTP`, `#KODIPROP`, an `http-*` attribute: a browser cannot send
  them), an address over 1,000 characters, a group matching adult terms. Names and groups are cleaned (valid UTF-8, no
  control characters) and shown as text, never as HTML.
- **Logos** are copied once by `/usr/bin/php8.4-cli prism-data/bin/fetch-logos.php [--limit=<1 to 1000>]` (default 100) into
  `<logo_dir>` (default `/prism-data/public/logos/`, served by Apache as plain files). Repeat it until it prints
  `fetched=0 failed=0`, or put it in cron (every 5 minutes, `--limit=250`; two runs never overlap). A picture is accepted
  only when its first bytes say PNG, JPEG, GIF or WebP (never by name or `Content-Type`, never SVG) and it is at most 256 KiB;
  a failure is counted and a stream is given up on after three. The fetcher allows only `http`/`https` on ports 80 and 443,
  resolves the name itself, refuses loopback, private, link-local, shared, unique-local and IPv4-mapped addresses (one bad
  answer blocks the name), connects to the address it vetted, re-vets every redirect (at most three), sends at most one
  request a second to a host, and never hands what it fetched to a caller of the HTTP API.
- **Config.** Optional `'playlist' => ['data_dir' => …, 'logo_dir' => …, 'user_agent' => …]` (see `config.example.php`); the defaults
  fit the host. The logo copier introduces itself as `PRISM/1.0 (+https://prism.nooroticx.tv)`: the contact address in
  `tt.user_agent` is for TwitchTracker only and is never sent to a logo host unless you put one in `playlist.user_agent` yourself.
- **Re-import.** Upload the new list, run the import with `--dry-run`, compare, run it for real, then `fetch-logos.php`. The
  list is iptv-org data (the Unlicense: public domain); the HLS page credits it.
- **The owner's playlist actions (the Playlist screen, `/admin/playlist`).** Owner only, like the rest of `/api/admin/*`:
  `GET /api/admin/streams?text=&state=&group=&country=&limit=&offset=` (every state, the owner's view; 50 a page by default,
  200 at most, with the count of every state) and `POST /api/admin/streams/add|update|pin|default|remove` (JSON bodies, `public_id`
  for an existing stream, at most 4 KiB). **Add** applies the import's rules (a refused address or name is 422 with its `reason`, a
  known address, even a removed one, is 409 `already_known`) and stores it with source `manual`; **update** renames a stream and
  replaces its groups; **default** needs a stream visitors can see (409 `not_listed` otherwise); **remove** leaves a tombstone (state
  `removed`, no longer default or pinned) and deletes its logo copy, so a re-import cannot bring it back. Every write is one
  transaction with its audit row (`stream.add`, `stream.update`, `stream.pin`, `stream.default`, `stream.remove`, shown on the
  Security screen), and the visitor snapshot is rewritten after the commit; if only that rewrite fails the answer is `ok` with
  `snapshot: false` and the list catches up on the next change.
- **Deploy order.** `deploy.mjs --go`, then `install.php` (expect `applied 003_streams`, and `applied 004_checker` once the checker
  is deployed), then the import, then the logos. The admin API ships with the server code; the Playlist screen ships with the
  front end, so deploy the server first.

## The stream checker (piece 3a)

Design: `docs/superpowers/specs/2026-11-14-playlist-checker-design.md` (it wins over the older "Piece 3" section of the playlist spec
where they differ). The checker plays each stream's first moments the way a PRISM visitor's browser would, hides the streams that
fail, and brings them back if they recover. Migration `004_checker.sql` adds its columns (`host`, `ever_passed`, `fail_days`,
`last_fail_day`, `check_result`, `check_bytes`, `state_changed_at`, `next_check_at`).

- **A check** (`src/Checker/StreamChecker.php`): GET only, always with `Origin: https://prism.nooroticx.tv`. HLS: the playlist, its
  first variant, then the first bytes of a segment (the second one when the list is live and has three or more, because a live
  list's first segment is about to expire; `Range: bytes=0-65535`; a cut at 64 KiB, or a stall after the bytes began to arrive, is a pass). DASH: the manifest only. CORS must
  hold on every response of the chain, hop by hop as a browser sees it (`Origin: null` after a cross-origin redirect). Hosts of
  Twitch and YouTube are never fetched (`skipped`). Everything goes through the guarded fetcher with the checker's policy: https
  only, ports 80, 443 and 1024 up except the ports Chromium refuses, a public address vetted on every hop. Results are one of a
  fixed set of codes (`pass`, `no_cors`, `unreachable`, `http_status`, `not_playlist`, `no_variant`, `no_segment`,
  `segment_failed`, `too_large`, `insecure`, `blocked`, `redirects`, and the no-information codes `host_guard`, `voided`,
  `skipped`): never an address, never text from the other side. Limits: 8 s per request and 30 s per stream, 256 KB per
  playlist, 64 KiB per segment, 3 redirects, at most one request a second to the host in a stream's address (`HostPacer`).
- **States and timing** (`StateMachine`, `Schedule`): `new` and `held(awaiting_check)` are checked first; `working` daily;
  `suspect` (a once-working stream that failed) about every 6 hours, `dead` after failures on three different UTC days
  (`failed_3_days`, every 2 days); a stream that never passed is `dead(never_passed)` after one failed check (daily);
  `unplayable(no_cors)` weekly; `removed(dead_14_days)` monthly (a pass brings any of them back to `working`). **A stream the
  owner removed is never checked or revived.** A pinned or default stream is hidden like any other when it fails, but it keeps its
  pin and default flag and is never auto-removed (the page falls back to its demo default meanwhile).
- **Guards.** The host guard: when more than half of a host's streams (at least four) fail in a run, the failures of streams that
  passed before are set aside (`host_guard`); streams that never passed are not protected. The run guard asks whether the
  checker's own network is down: it takes ONE vote per host over the last 50 hosts a worker asked (a big host that is down is one
  piece of evidence, not fifty), only from streams expected to play (`new`, `held(awaiting_check)`, `working`, never `suspect` or
  `dead`), and only "no answer at all" (`unreachable`) counts against; when two thirds of those hosts did not answer, the worker
  stops (`stopped=run_guard`) and voids the streams that voted (`voided`, treated as not checked, so they are done again by the
  next launch). A failing check is tried once more at the end of its batch before it counts. An auto-removal is also refused for
  a row the owner pinned or made the default since the worker read it.
- **Shadow run, then Apply.** Until the owner presses Apply on the Health screen the checker only *records* results: no state
  changes and the visitor snapshot is not rewritten. Apply (`POST /api/admin/checker/apply`) runs the recorded first-pass results
  through the same state machine a live run uses, in one transaction with the audit row `checker.apply`, then rewrites the
  snapshot. It refuses (409 `refused` with a reason) while a stream has no result (`incomplete`), when a result is older than 3
  days (`stale`), or when two thirds or more of the results are failures (`too_many_failures`). After Apply the checker is live.
- **Commands** (command line only, `/usr/bin/php8.4-cli`; they print counts and fixed words, never an address or a config value):
  - `prism-data/bin/check-streams.php [--first-pass] [--limit=<1..2000>]`: the launcher. One launch at a time (database lock
    `prism_playlist_check`; a second prints `skipped (another run is active)`). With `checker.workers` above 1 it starts that many
    `bin/check-worker.php <k>/<n>` processes, each owning the streams whose host hashes into its slice; if processes cannot be
    started it runs one worker over everything. Prints `workers=<n> checked=<n> passed=<n> failed=<n> guarded=<n> voided=<n>
    bytes=<n>` (plus ` stopped=<paused|cap|run_guard>` when a worker stopped early). `--first-pass` keeps taking batches until
    nothing is due. `--pause`, `--resume` (the kill switch) and `--status` (`mode=<shadow|live> paused=<0|1> checked=<n>
    eligible=<n>`) do not check anything.
  - `prism-data/bin/rejudge-held.php [--apply]`: moves streams held only because of their port, that the current rule allows, to
    `held(awaiting_check)` (still hidden until the first pass checks them). Dry run by default; audit row `stream.rejudge`.
- **Config** (all optional, see `config.example.php`): `playlist.check_origin`, `playlist.check_user_agent` (default
  `PRISM-StreamChecker/1.0 (+https://prism.nooroticx.tv/stream-checker/)`: a link to the public page `public/stream-checker/`,
  no personal contact address), `checker.workers` (1 to 12, default 1), `checker.batch` (1 to 2000, default 300),
  `checker.first_pass_cap_mb` (4096) and `checker.daily_cap_mb` (1024). Bytes are counted as read from the network; the first pass
  has its own total, every UTC day after Apply has the daily one; a worker stops with `cap` at the limit.
- **Admin API** (owner only, `Cache-Control: no-store`): `GET /api/admin/checker` (status: mode, progress, outcome by result code,
  what Apply would hide, host clusters, guarded hosts, flagged streams, budget, last early stop), `POST /api/admin/checker/apply`,
  `/pause`, `/resume` (an empty body or `{}`). Pause and resume are audited (`checker.pause`, `checker.resume`). The Playlist
  list rows also carry `last_checked_at` and `check_result`.
- **Rollout order (each live step needs the owner's go).** 1. Deploy the server code and run `install.php` (expect
  `applied 004_checker`; nothing changes for visitors). 2. `rejudge-held.php` dry run, then `--apply`. 3. Probe how many PHP
  processes and cron entries the host allows: start with `checker.workers` 2, read the database's `wait_timeout`
  (`SHOW VARIABLES LIKE 'wait_timeout'`; the launcher asks for eight hours on its lock connection, a host may refuse), and run
  `check-streams.php --limit=20` once to see both workers start and finish. 4. The shadow first pass in one sitting:
  `check-streams.php --first-pass` (not from cron: until Apply only the first pass is run, by hand). 5. Review the Health screen
  (progress, outcome, host clusters) and press Apply. 6. Enable the steady cron entry, for example every 15 minutes:
  `*/15 * * * * /usr/bin/php8.4-cli /prism-data/bin/check-streams.php` (each stream is due once a day, so the load spreads
  itself). 7. Remove the logo copier's cron line when its work is done.

## IONOS host notes

- **Which PHP.** The scripts in `bin/` are command line only (they exit unless `PHP_SAPI` is `cli`). On this host the
  default `php` is 4.4.9 and `php8.4` is the CGI build, so use **`/usr/bin/php8.4-cli`** for the install script, the
  cron job and `remove-channel.php`. Over SSH the working directory is the webspace root, so
  `/usr/bin/php8.4-cli prism-data/bin/install.php` creates the tables.
- **The Authorization header.** The CGI PHP here does not receive the `Authorization` header by itself (checked live
  2026-11-14: a throwaway probe saw `X-Prism-Authorization` but not `Authorization`). `public/.htaccess` therefore copies it into an
  environment variable before the rewrite, and PHP sees it as `REDIRECT_HTTP_AUTHORIZATION` (verified live the same way);
  `Request::fromGlobals()` also reads `HTTP_AUTHORIZATION` and the custom `X-Prism-Authorization` as fallbacks.
- **Database.** Each database has its own login in the IONOS panel, and `db.name` in `config.php` must be the
  database's own name (`dbs` and digits), not its description. A login that is valid but not allowed into the named
  database fails with MySQL error 1044 (the server reports only "Database connection failed" by design).
- **Contact address.** `tt.user_agent` must carry a real contact address; the server refuses the example one.

## Tests

PHP runs in Docker at the host's version (8.4) and MariaDB at 10.11. The host's database is MariaDB 11.8, which the
panel chose by default: every table pins its own collation (`utf8mb4_unicode_ci`), but the suite has not been run
against 11.8. PHPUnit is a dev dependency of the test image only.

```bash
docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit
```

- The first run builds the image and pulls the base images.
- If `composer.json` changes, reset the cached vendor volume once: `docker compose -f server/docker-compose.test.yml down -v`.
- Stop the test database with `docker compose -f server/docker-compose.test.yml down`.
