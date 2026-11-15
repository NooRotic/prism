# Playlist piece 3a: the stream checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled, parallel stream checker on the history server that records every stream's health as a shadow run, applies it once on the owner's say-so, then keeps the visitor playlist limited to streams that play; plus a minimal Health screen and the checker's public page.

**Architecture:** The existing guarded fetcher (`SafeFetcher` + `CurlPinnedTransport`) gains a policy, request headers, a probe mode and per-hop results. A pure state machine turns `(row, result code, now)` into a transition. Worker processes (one cron entry starts them) each own the streams whose host hashes into their slice, write one result per stream (compare-and-set), and before Apply change no state. A new admin API and `/admin/health` screen show progress and apply. The public `/stream-checker/` page is a static file.

**Tech Stack:** PHP 8.4 + MariaDB + PHPUnit 11 (runtime has no Composer dependencies); React 19 + TypeScript + Vitest for the admin screen.

**Spec:** `docs/superpowers/specs/2026-11-14-playlist-checker-design.md` (approved 2026-11-15). Parent: `docs/superpowers/specs/2026-11-13-playlist-admin-design.md`.

**Branch and setup (not a task):** build on a new branch `feat/stream-checker` cut from `origin/main` AFTER PR #82 (piece 2) is merged, in its own worktree (`git worktree add .claude/worktrees/stream-checker -b feat/stream-checker origin/main`). The design and this plan are untracked files in the playlist-store worktree; copy both into the new worktree and commit them first (`docs: playlist piece 3a design and plan`). Never push to `main`; no push, PR, deploy or host command without the owner's go.

## Global Constraints

- Commits carry **no** `Co-Authored-By` line. Never read, print or commit `config.php`, `prism-data.config.php`, any `.env` or `IONOS_SSH_PASSWORD`.
- Server code: PHP 8.4, `declare(strict_types=1)`, namespace `Prism\History\...`, no new Composer runtime dependency. Server tests: from the repo root `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit --filter <ClassOrTest>`; the whole suite without `--filter`. Front end: `node ./node_modules/vitest/vitest.mjs run <file>`; whole checks `pnpm exec tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`, `pnpm build`.
- Output of the checker (CLI lines, logs, admin API, `check_result` column) is **counts and these fixed codes only**, never an address or text from the other side: `pass`, `no_cors`, `unreachable`, `http_status`, `not_playlist`, `no_variant`, `no_segment`, `segment_failed`, `too_large`, `insecure`, `blocked`, `redirects`; no-information codes `host_guard`, `voided`, `skipped`.
- Identity strings, exact: user agent `PRISM-StreamChecker/1.0 (+https://prism.nooroticx.tv/stream-checker/)`, origin `https://prism.nooroticx.tv`.
- Limits (config, these defaults): 8 s per request, 30 s per stream in total, 256 KB per playlist, 64 KiB per segment, 3 redirects, one request a second per **stream host**, first-pass cap 4096 MB, daily cap 1024 MB, both counted in bytes read after decompression.
- Allowed fetches for the checker: `https` only, ports 80, 443 and 1024-65535 minus Chromium's restricted list (copy the current list from Chromium's `net/base/port_util.cc` `kRestrictedPorts`; the ones at 1024 and above are 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665-6669, 6679, 6697, 10080; note the source and date in a comment). The logo copier's policy (http and https, ports 80 and 443) must not change.
- Timing table (seconds; `null` = never checked): `new` 0, `held(awaiting_check)` 0, `working` 86400, `suspect` 21600, `dead(never_passed)` 86400, `dead(failed_3_days)` 172800, `unplayable(no_cors)` 604800, `removed(dead_14_days)` 2592000, everything else `null`. Three different UTC days of failure make a once-working stream `dead`; dead 14 days with no pass is removed (never a pinned or default stream).
- Migrations: plain SQL, one statement at a time, every statement re-runnable (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

## Review Focus

- **Owner removals are never rechecked or revived** (`removed` with a reason other than `dead_14_days`, `NULL` included); the checker's auto-removal never touches a pinned or default stream and deletes the logo copy. (Tasks 2, 3, 8)
- **A stream the owner edits, pins or removes while a worker is checking it is not overwritten**: the result write is compare-and-set on state and reason. (Tasks 3, 8)
- **Nothing visitors can see changes before Apply**: in shadow mode no `state` changes and no snapshot is written; re-judged ports go to a hidden state. (Tasks 4, 8, 10)
- **The host guard protects only streams that passed once**, never double-counts, and the run guard voids rather than hides. (Tasks 7, 8)
- **The fetch guard holds for every hop the checker follows**: a playlist or segment address that is `http`, on a refused port, or resolves to a private, loopback or metadata address is `insecure`/`blocked` and never fetched; no result, log or API field carries text from the other side. (Tasks 1, 5)

---

### Task 1: Fetch policy, request headers, probe mode and per-hop results

**Files:**
- Create: `server/src/Net/FetchPolicy.php`
- Modify: `server/src/Net/SafeFetcher.php`, `server/src/Net/SafeFetchResult.php`, `server/src/Net/PinnedTransport.php`, `server/src/Net/CurlPinnedTransport.php`, `server/tests/Support/FakeTransport.php`, `server/tests/fixtures/http/pinned.php`
- Test: `server/tests/FetchPolicyTest.php` (new), `server/tests/SafeFetcherTest.php`, `server/tests/CurlPinnedTransportTest.php`

**Interfaces:**
- Produces: `FetchPolicy::logos(): self`, `FetchPolicy::checker(): self`, `allows(string $scheme, int $port): bool`.
- Produces: `PinnedTransport::get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = '', array $requestHeaders = [], bool $probe = false): PinnedResponse` (`$requestHeaders` is `array<string,string>`, name => value; `$probe` sets no `CURLOPT_MAXFILESIZE`, the cut is by the write callback and the answer's status is kept with `truncated = true`).
- Produces: `SafeFetcher::__construct(Resolver $resolver, PinnedTransport $transport, string $userAgent, int $maxRedirects = 3, ?FetchPolicy $policy = null)` (null means `FetchPolicy::logos()`, so every existing caller and test is unchanged) and `fetch(string $url, int $maxBytes, int $timeoutSec = 8, array $headers = [], bool $probe = false): SafeFetchResult`.
- Produces: `SafeFetchResult` gains a last constructor parameter `public readonly array $hops = []`, `list<array{status:int,url:string,headers:array<string,string>}>`, one entry per response in order (each redirect, then the final one).
- `FakeTransport` records `headers` and `probe` in each `calls` entry (the other keys stay).

- [ ] **Step 1: Failing tests.** `FetchPolicyTest`: `logos()` allows (`http`,80), (`https`,443), refuses (`https`,8443); `checker()` allows (`https`,443), (`https`,80), (`https`,1024), (`https`,8443), (`https`,65535); refuses (`http`,80), (`http`,8080), (`https`,1023), (`https`,22), (`https`,6000), (`https`,6697), (`https`,10080), (`https`,65536), (`https`,0). `SafeFetcherTest`: with the checker policy a `http://` URL fails with error `scheme` and an `https://x.test:8443/` URL is fetched; with the default policy `https://x.test:8443/` still fails `port` (unchanged); `$headers` reach the transport (`Origin`, `Range`); `$probe` reaches the transport; `hops` holds status, url and headers of a 302 and the final 200 (two entries) and a single entry for a plain 200; an `Origin` header becomes `null` on every request after a redirect to a different origin (scheme, host or port differs) and stays on a same-origin redirect. `CurlPinnedTransportTest` (real built-in server, extend the `pinned.php` fixture to echo the received `Origin` and `Range` headers and to serve a 200 KB body that ignores `Range`): the request headers arrive; with `$probe = true` and `$maxBytes = 65536` the answer has status 200, 65536 body bytes and `truncated = true` (and without `$probe`, `Content-Length` over `$maxBytes` still returns `truncated` with an empty body, as before).
- [ ] **Step 2:** Run `--filter 'FetchPolicyTest|SafeFetcherTest|CurlPinnedTransportTest'`. Expected: the new tests FAIL (class and parameters missing).
- [ ] **Step 3:** Implement the signatures above. `SafeFetcher::vet()` asks the policy (`scheme`, then `port`) instead of its `PORTS` constant; `fetch()` records every hop and applies the `Origin` rule; `CurlPinnedTransport` sets `CURLOPT_HTTPHEADER` from `$requestHeaders` and skips `CURLOPT_MAXFILESIZE` when `$probe`.
- [ ] **Step 4:** Re-run the same filter plus the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the guarded fetcher takes a policy, request headers, a probe mode and returns every hop`.

---

### Task 2: Result codes, the state machine and the schedule

**Files:**
- Create: `server/src/Checker/CheckResult.php`, `server/src/Checker/Transition.php`, `server/src/Checker/StateMachine.php`, `server/src/Checker/Schedule.php`
- Test: `server/tests/StateMachineTest.php`, `server/tests/ScheduleTest.php`

**Interfaces:**
- Produces: `CheckResult::CODES` (the fifteen codes in Global Constraints), `CheckResult::NO_INFORMATION = ['host_guard','voided','skipped']`; `new CheckResult(string $code, int $bytes = 0, array $facts = [])` (throws `InvalidArgumentException` on an unknown code); `isPass()`, `isNoInformation()`, `isNoCors()`, `isFailure()` (neither pass, no-information nor `no_cors`).
- Produces: `StateMachine::next(array $row, CheckResult $result, int $nowMs): Transition`. `$row` keys: `state`, `state_reason`, `ever_passed` (int), `fail_days` (int), `last_fail_day` (`Y-m-d` or null), `pinned`, `is_default`, `state_changed_at` (datetime string or null).
- Produces: `Transition` with public readonly `state`, `reason` (?string), `everPassed` (bool), `failDays` (int), `lastFailDay` (?string), `changed` (bool: state or reason differs).
- Produces: `Schedule::intervalSeconds(string $state, ?string $reason): ?int` and `Schedule::nextCheckAt(string $state, ?string $reason, int $nowMs): ?string` (a `Y-m-d H:i:s` UTC string, null when never).

- [ ] **Step 1: Failing tests** (table-driven, one data provider row per rule in the design's "Transitions after Apply"): pass from `new`, `suspect`, `working`, `dead(never_passed)`, `dead(failed_3_days)`, `unplayable(no_cors)`, `held(awaiting_check)`, `removed(dead_14_days)` gives `working` with `everPassed` true and `failDays` 0; fail from `new`, `held(awaiting_check)`, `dead(never_passed)` gives `dead(never_passed)`; fail from `working` gives `suspect`, `failDays` 1, `lastFailDay` today; a second fail the same UTC day leaves `failDays` 1; a fail on the next UTC day makes 2; the third different day makes `dead(failed_3_days)`; `no_cors` from `new` or `dead(never_passed)` gives `unplayable(no_cors)`; `no_cors` from a stream with `ever_passed` is treated as a fail (suspect grace); `unplayable(no_cors)` followed by `unreachable` stays; `host_guard`, `voided`, `skipped` change nothing (`changed` false, counters untouched); a `dead` stream whose `state_changed_at` is 14 days or more ago and fails becomes `removed(dead_14_days)`, but not when `pinned` or `is_default` is 1 (stays `dead`); `removed` with reason `NULL` and with reason `owner`, `unplayable(http)` and `held(port)` return unchanged for any code. `ScheduleTest`: every row of the timing table; `nextCheckAt('working', null, <ms>)` is exactly 86400 s later; `new` returns the same instant; a never-checked state returns null.
- [ ] **Step 2:** Run `--filter 'StateMachineTest|ScheduleTest'`. Expected: FAIL (classes missing).
- [ ] **Step 3:** Implement the classes; `StateMachine::next` is pure (no clock, no I/O: `$nowMs` is the only time input; the UTC day of a failure is `gmdate('Y-m-d', intdiv($nowMs, 1000))`).
- [ ] **Step 4:** Re-run. Expected: all pass.
- [ ] **Step 5: Commit** `feat: checker result codes, state machine and schedule`.

---

### Task 3: Migration 004 and the store's checker methods

**Files:**
- Create: `server/migrations/004_checker.sql`
- Modify: `server/src/Store/StreamStore.php`, `server/src/Playlist/StreamUrl.php`, `server/src/Store/JobState.php`
- Test: `server/tests/SchemaTest.php`, `server/tests/StreamStoreTest.php`, `server/tests/StreamUrlTest.php` (extend or create), `server/tests/JobStateTest.php`

**Interfaces:**
- Produces: columns on `streams` (builder may rename, but these meanings are fixed): `host VARCHAR(255) NOT NULL DEFAULT ''` (backfilled with `LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(url, '/', 3), '//', -1), ':', 1))`), `ever_passed TINYINT(1) NOT NULL DEFAULT 0` (backfilled 1 where `state = 'working'`), `fail_days TINYINT UNSIGNED NOT NULL DEFAULT 0`, `last_fail_day DATE NULL`, `check_result VARCHAR(20) NULL`, `check_bytes INT UNSIGNED NULL`, `state_changed_at DATETIME NULL`, `next_check_at DATETIME NULL`; indexes on `host` and on `(state, next_check_at)`. `last_checked_at` and `facts_json` already exist.
- Produces: `StreamUrl::host(string $normalisedUrl): string` (lower-case host, no port, no brackets).
- Produces on `StreamStore`: `insertIfNew` fills `host` when the row lacks it; the `READ` column list gains `host`, `ever_passed`, `fail_days`, `last_fail_day`, `check_result`, `state_changed_at` and `next_check_at` (not `facts_json`), and `typed()` casts `ever_passed` and `fail_days` to int, so a row from the store is exactly the `$row` Task 2's `StateMachine::next` needs; `dueForCheck(int $worker, int $workers, int $limit, int $nowMs): list<array>` (rows of the checkable states in the timing table with `next_check_at IS NULL OR next_check_at <= now`, `MOD(CRC32(host), $workers) = $worker`, ordered `new` and `held` first, then `suspect`, then oldest `last_checked_at`, never `removed` rows whose reason is not `dead_14_days`); `recordShadow(string $id, CheckResult $r, int $nowMs): void` (writes `check_result`, `check_bytes`, `facts_json`, `last_checked_at`, `next_check_at` = now + 86400 s; never touches `state`); `applyTransition(string $id, string $expectedState, ?string $expectedReason, Transition $t, CheckResult $r, int $nowMs): bool` (compare-and-set: writes state, reason, `ever_passed`, `fail_days`, `last_fail_day`, the result columns, `next_check_at` from `Schedule`, `state_changed_at` when the state or reason changed, `logo_file = NULL` when the new state is `removed`; false when the row no longer matches); `markVoided(list<string> $ids, int $nowMs): void` (sets `check_result = 'voided'`, `next_check_at = now`); `firstPass(): array{eligible:int,checked:int,oldest_result_at:?string}` (eligible = states `new`, `working`, `suspect`, `held` with reason `awaiting_check`; checked = those with a non-null `check_result`); `resultCounts(): array<string,int>` (code => streams, over the eligible set); `hostClusters(int $minStreams = 4): list<array{host:string,streams:int,failed:int}>` (hosts with at least `$minStreams` eligible streams where more than half have a failure code as `check_result`, failure = not `pass` and not a no-information code); `flagged(): list<array>` (pinned or default streams that are `dead`); `guardedHosts(): list<array{host:string,streams:int}>` (hosts with `host_guard` results).
- Produces: `JobState::add(string $key, int $n): int` (adds `$n`, returns the new value, same single-statement `LAST_INSERT_ID` trick as `incr`).

- [ ] **Step 1: Failing tests.** `SchemaTest`: after the migrations the new columns and indexes exist; running the migrator twice is a no-op; a pre-existing row gets `host` backfilled (`https://Cdn.Example:8443/a.m3u8` gives `cdn.example`) and a `working` row gets `ever_passed = 1`. `StreamUrlTest`: `host()` lower-cases and strips port and brackets (`https://[2001:db8::1]:8443/x` gives `2001:db8::1`). `StreamStoreTest`: `insertIfNew` sets `host`; `dueForCheck` returns only the worker's slice (insert streams on hosts that hash to different slices, assert the union over `0..n-1` is everything and slices are disjoint), orders `new` before `suspect` before older `last_checked_at`, skips a `removed` row with reason `NULL` and with reason `owner`, includes `removed(dead_14_days)` only when due, includes `held(awaiting_check)`, skips `held(port)` and `unplayable(http)`; `recordShadow` leaves `state` untouched and sets `next_check_at` 24 h ahead; `applyTransition` writes everything, returns false (changing nothing) when the stored state differs from `$expectedState`, and nulls `logo_file` for `removed`; `firstPass`, `resultCounts`, `hostClusters` (a host with 4 streams and 3 failures is listed, with 2 failures it is not, with 3 streams it is not), `flagged`, `guardedHosts` on small fixtures. `JobStateTest`: `add` adds and returns the new value, and adds to a missing key.
- [ ] **Step 2:** Run `--filter 'SchemaTest|StreamStoreTest|StreamUrlTest|JobStateTest'`. Expected: new tests FAIL.
- [ ] **Step 3:** Write migration `004`, then the code. The migrator runs plain SQL statement by statement, so the backfills are plain `UPDATE` expressions and every `ALTER` is `ADD COLUMN IF NOT EXISTS`.
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: checker columns, store methods and a counter that adds`.

---

### Task 4: The port rule and the held-rows re-judge command

**Files:**
- Modify: `server/src/Playlist/ImportRules.php`, `server/src/Container.php`
- Create: `server/src/Playlist/HeldRejudge.php`, `server/bin/rejudge-held.php`
- Test: `server/tests/ImportRulesTest.php`, `server/tests/ImporterTest.php`, `server/tests/HeldRejudgeTest.php` (new), `server/tests/RejudgeCliTest.php` (new)

**Interfaces:**
- Produces: `ImportRules::stateOf(string $normalisedUrl): array{0:string,1:?string}` becomes `public static` and uses `FetchPolicy::checker()`: `http://` is `['unplayable','http']`; `https` where `allows('https', port)` is `['new', null]`; any other explicit port is `['held','port']`.
- Produces: `HeldRejudge::__construct(StreamStore $store, AuditStore $audit, Clock $clock)`, `run(bool $apply): array{candidates:int,moved:int}` (candidates are `held` rows with reason `port` whose address the rule now allows; applying sets state `held`, reason `awaiting_check`, writes one audit row `stream.rejudge` with the count, and never changes any other column).
- Produces: `bin/rejudge-held.php [--apply]` (command line only; dry run by default; prints `candidates=<n> moved=<n>`; takes no lock but prints only counts).

- [ ] **Step 1: Failing tests.** Rules: `https://h.test:8443/a.m3u8` is `new`; `https://h.test:1936/a` is `new`; `https://h.test:8/a` is `held(port)`; `https://h.test:6000/a` is `held(port)`; `http://h.test:8080/a` is `unplayable(http)`; `https://h.test/a` (no port) is `new`; the importer stores a stream on port 8443 as `new` and one on port 22 as `held`. `HeldRejudgeTest`: with rows `held(port)` on ports 1936, 8443, 22 and 6000 plus an `unplayable(http)` row, dry run reports `candidates=2 moved=0` and changes nothing; apply moves exactly those two to `held(awaiting_check)`, leaves the rest, writes one audit row, and a second apply finds `candidates=0`; moved rows are not in `StreamStore::listed()`. `RejudgeCliTest` (same harness as `RefreshCliTest`): without `--apply` the exit code is 0 and the rows are unchanged; with a bad argument exit code 2.
- [ ] **Step 2:** Run `--filter 'ImportRules|ImporterTest|HeldRejudgeTest|RejudgeCliTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement; wire `Container::heldRejudge(Config, PDO, ?Clock)`.
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: any https port 1024 and up is stored, and a command re-judges the held rows`.

---

### Task 5: The check itself

**Files:**
- Create: `server/src/Checker/StreamChecker.php`, `server/src/Checker/PlaylistReader.php`
- Test: `server/tests/StreamCheckerTest.php`, `server/tests/PlaylistReaderTest.php`

**Interfaces:**
- Consumes: Task 1's `SafeFetcher` (checker policy, `fetch(..., $headers, $probe)`, `hops`) and Task 2's `CheckResult`.
- Produces: `PlaylistReader::parse(string $body): array{master:bool, variants:list<string>, segments:list<string>, live:bool, facts:array}` (HLS text: `variants` are the URIs after `#EXT-X-STREAM-INF`, `segments` the URIs after `#EXTINF`, `live` is the absence of `#EXT-X-ENDLIST`; `facts` has `variants` (count), `codecs` (list from `CODECS=`), `captions` (list from `TYPE=CLOSED-CAPTIONS|SUBTITLES`), `audio_languages` (from `TYPE=AUDIO` `LANGUAGE=`)); returns `master:false, variants:[], segments:[]` for text that does not start `#EXTM3U`.
- Produces: `StreamChecker::DENY_HOSTS` (the seven names below), `StreamChecker::__construct(SafeFetcher $fetcher, string $origin, Clock $clock, array $denyHosts = self::DENY_HOSTS)`; `check(array $row): CheckResult` (never throws; `$row` needs `url`, `kind`).
- Behaviour (design "What a check does"): deny-listed host (`twitch.tv`, `ttvnw.net`, `jtvnw.net`, `youtube.com`, `youtu.be`, `googlevideo.com`, `ytimg.com` and subdomains) returns `skipped` without any request; manifest must be 2xx (else `http_status`) and start `#EXTM3U` for HLS / contain an `<MPD` root for DASH (else `not_playlist`); a master playlist: fetch the first variant (resolve with `SafeFetcher::resolveLocation()`), also `#EXTM3U` (else `no_variant`); HLS segment: the first, or the second when `live` and there are at least three; no segment is `no_segment`; fetched with `Range: bytes=0-65535`, `$probe = true`, 64 KiB; pass when status 200 or 206 with at least one byte (else `segment_failed`); a cut at 64 KiB is a pass; DASH is manifest level only; CORS on every hop of every request (`Access-Control-Allow-Origin` is `*` or the sent origin, or `*` or `null` after a cross-origin hop) else `no_cors` (checked after the fetch succeeded); the `SafeFetcher` error codes map: `scheme` to `insecure`, `port` and `blocked` to `blocked`, `dns` and `network` to `unreachable`, `redirects` to `redirects`, `too_large` to `too_large`; total wall time over 30 s between steps gives `unreachable`; `bytes` is the sum of body bytes read; `facts` come from the media/master playlist and add `live`.

- [ ] **Step 1: Failing tests** with `FakeTransport` and `FakeResolver` (public IPs): a happy HLS master -> media -> segment chain gives `pass`, bytes > 0, the three requests carry `Origin: https://prism.nooroticx.tv` and the segment request carries `Range` and probe mode; every code above gets one test (manifest 404 `http_status`; HTML body `not_playlist`; master without variants `no_variant`; media playlist without segments `no_segment`; segment 500 `segment_failed`; segment answered 200 with 200 KB and cut at 64 KiB `pass`; ACAO missing on the manifest, on the media playlist, on the segment, and on a redirect hop each `no_cors`; ACAO `*` and ACAO equal to the origin pass; a cross-origin redirect makes the next request carry `Origin: null` and ACAO `https://prism.nooroticx.tv` then fails `no_cors`; a child playlist URI that is `http://` `insecure`; a segment URI resolving to `10.0.0.5` `blocked` and the transport never asked for it; port 22 `blocked`; DNS failure `unreachable`; a playlist over 256 KB `too_large`; a live playlist with three segments uses the second; a VOD playlist uses the first; DASH `<MPD` passes at manifest level with no further requests; each deny-listed host family `skipped` with zero transport calls). `PlaylistReaderTest`: master with codecs, a CC track and an audio language; media with ENDLIST; live media; non-playlist text. Assert no result field contains the stream's address.
- [ ] **Step 2:** Run `--filter 'StreamCheckerTest|PlaylistReaderTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement. Every fetch goes through `SafeFetcher`; the checker has no curl call of its own.
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the stream check: manifest, first variant, first chunk, CORS hop by hop`.

---

### Task 6: Config, the checker's state and its limits

**Files:**
- Modify: `server/src/Config.php`, `server/src/RunLock.php`, `server/config.example.php`
- Create: `server/src/Checker/CheckerState.php`
- Test: `server/tests/ConfigTest.php` (the existing config tests), `server/tests/CheckerStateTest.php`

**Interfaces:**
- Produces on `Config` (each never throws, a wrong value means the default): `checkerOrigin(): string` (`playlist.check_origin`, default `https://prism.nooroticx.tv`), `checkerUserAgent(): string` (`playlist.check_user_agent`, same plain-text rules as `playlistUserAgent()`, default the exact string in Global Constraints), `checkerWorkers(): int` (`checker.workers`, 1 to 12, default 1), `checkerBatch(): int` (`checker.batch`, 1 to 2000, default 300), `checkerFirstPassCapBytes(): int` (`checker.first_pass_cap_mb` x 1048576, default 4096 MB), `checkerDailyCapBytes(): int` (`checker.daily_cap_mb`, default 1024 MB).
- Produces: `RunLock::CHECKER = 'prism_playlist_check'`.
- Produces: `CheckerState::__construct(JobState $state, Clock $clock)`; `appliedAt(): ?string`, `markApplied(): void`, `isPaused(): bool`, `setPaused(bool $paused): void`, `bytesToday(): int` (key `checker_bytes_<Ymd>` in UTC), `firstPassBytes(): int`, `addBytes(int $n): void` (adds to the day's key and, while not applied, to `checker_bytes_first_pass`), `capReached(int $dailyCapBytes, int $firstPassCapBytes): bool` (before Apply the first-pass total against its cap, after Apply today's total against the daily cap), `recordStop(string $reason): void` and `lastStop(): ?array{reason:string,at:string}`.

- [ ] **Step 1: Failing tests.** Config: each default; a valid override; an out-of-range value, a non-string and a user agent with a newline each give the default. `CheckerStateTest` (fake clock): fresh state is not applied and not paused; `markApplied` stores the instant and `appliedAt` returns it; `addBytes` accumulates per UTC day and rolls over at midnight UTC; before Apply the first-pass cap decides `capReached`, after Apply the daily cap does; `setPaused` round-trips.
- [ ] **Step 2:** Run `--filter 'ConfigTest|CheckerStateTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement; document the keys in `config.example.php` (names and defaults only, no values that look like secrets).
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: checker config keys, its lock name and its state`.

---

### Task 7: The guards

**Files:**
- Create: `server/src/Checker/HostGuard.php`, `server/src/Checker/RunGuard.php`
- Test: `server/tests/HostGuardTest.php`, `server/tests/RunGuardTest.php`

**Interfaces:**
- Produces: `HostGuard::guardedHosts(array $results): array<string,true>` where `$results` is `list<array{host:string,failed:bool}>` for one run: a host is guarded when at least four of its streams were checked in the run and more than half failed.
- Produces: `RunGuard::__construct(int $window = 50, float $threshold = 2/3)`; `record(bool $failed): void`; `tripped(): bool` (true once `$window` results are recorded and at least `$threshold` of the last `$window` failed); `lastResults(): int` (how many of the window to void, i.e. the window size once tripped).

- [ ] **Step 1: Failing tests.** HostGuard: a host with 4 checked and 3 failed is guarded; 4 and 2 is not; 3 and 3 is not (under four); 8 and 4 is not (exactly half); mixed hosts independent. RunGuard: 49 failures do not trip (window not full); 50 failures trip; 33 of 50 failing does not trip, 34 does; the window rolls (after 50 passes following 50 failures it is not tripped); with a custom window and threshold.
- [ ] **Step 2:** Run `--filter 'HostGuardTest|RunGuardTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement (both pure, no I/O).
- [ ] **Step 4:** Re-run. Expected: pass.
- [ ] **Step 5: Commit** `feat: the host guard and the run guard`.

---

### Task 8: The worker

**Files:**
- Create: `server/src/Checker/CheckWorker.php`
- Modify: `server/src/Container.php`
- Test: `server/tests/CheckWorkerTest.php`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6, 7 (`StateMachine`, `StreamStore`, `StreamChecker`, `CheckerState`, guards) and the existing `Sleeper`, `Clock`, `SnapshotWriter`.
- Produces: `CheckWorker::__construct(StreamStore $store, StreamChecker $checker, CheckerState $state, Sleeper $sleeper, Clock $clock, SnapshotWriter $snapshot, string $logoDir, int $dailyCapBytes, int $firstPassCapBytes)`; `run(int $worker, int $workers, int $limit, bool $firstPass): array{checked:int,passed:int,failed:int,guarded:int,voided:int,stopped:?string,bytes:int}`.
- Produces: `Container::checkWorker(Config $config, PDO $pdo, ?Resolver $resolver = null, ?PinnedTransport $transport = null, ?Sleeper $sleeper = null, ?Clock $clock = null): CheckWorker` (the real resolver, transport and sleeper when null; the fetcher is built with `FetchPolicy::checker()`, `Config::checkerUserAgent()`).
- Behaviour: stops at once with `stopped = 'paused'` when the kill switch is set and `stopped = 'cap'` when `capReached`; takes `dueForCheck`, interleaves hosts round-robin and sleeps so no host is hit more than once a second (a fake `Sleeper` records it); `--first-pass` (`$firstPass`) keeps taking batches until its slice has no due stream; a failed check (a failure code or `no_cors`) is retried once at the end of the batch before it counts; per-host failures are tallied and a guarded host's results for streams with `ever_passed` are recorded as `host_guard` (streams that never passed are not protected); every result is written as it completes, one stream at a time: before Apply with `recordShadow`, after Apply through `StateMachine::next` and `applyTransition` (compare-and-set; a lost race drops the result); the run guard stops the worker, marks the last 50 results `voided` through `markVoided` and records the stop; bytes go to `CheckerState::addBytes`; when a transition moves a stream between listed and unlisted states, or into `removed`, the worker rewrites the snapshot once at the end (after Apply only) and deletes the stream's old logo file (a name of the logo copier's shape, inside the logo folder only); the bytes of a failed segment still count.

- [ ] **Step 1: Failing tests** (real database through `DbTestCase`, `FakeTransport`/`FakeResolver`/`FakeSleeper`/`FakeClock`): shadow mode: after a run every checked stream has a `check_result` and `state` is unchanged, the snapshot file does not change, `recordShadow` set `next_check_at`; after `markApplied` a `new` stream that fails becomes `dead(never_passed)`, a `working` one that fails becomes `suspect`, a passing `dead(never_passed)` returns to `working`, the snapshot is rewritten once; compare-and-set: a stream the test pins (or removes) between the worker's read and write (through a `Sleeper` hook) keeps the owner's change and the result is dropped; owner removal (`removed`, reason `NULL`) is never fetched; a pinned dead stream past 14 days stays `dead`, an unpinned one becomes `removed(dead_14_days)` and its logo file is deleted; the in-run retry: a stream that fails then passes is `pass`, one that fails twice is a failure, and the retry happens after the rest of the batch; host guard: a host with 5 streams, 4 failing, 3 of them `ever_passed` and 1 never passed, records `host_guard` for the 3 and a failure for the never-passed one; the run guard: 40 failing checks out of 50 stops the worker with `stopped = 'run_guard'` and the last 50 are `voided`; paused and cap stops; the slice: worker 0 of 2 and 1 of 2 never touch the same host; per-host pacing: 3 streams on one host and 3 on another produce sleeps of at least 1 s between same-host requests; `--first-pass` loops until its slice is empty; no log or return value contains an address.
- [ ] **Step 2:** Run `--filter CheckWorkerTest`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the check worker: slices, pacing, retries, guards, shadow and live writes`.

---

### Task 9: The launcher and the command line

**Files:**
- Create: `server/bin/check-streams.php`, `server/bin/check-worker.php`
- Test: `server/tests/CheckCliTest.php`

**Interfaces:**
- Consumes: `Container::checkWorker`, `RunLock::CHECKER`, `Config::checkerWorkers()`, `checkerBatch()`, `CheckerState`.
- Produces: `bin/check-streams.php [--first-pass] [--limit=<1..2000>] [--pause|--resume|--status]` (command line only): takes `RunLock::CHECKER` for the whole launch and prints `skipped (another run is active)` and exits 0 when it is held; `--pause` and `--resume` set the kill switch and print `paused` or `resumed`; `--status` prints `mode=<shadow|live> paused=<0|1> checked=<n> eligible=<n>`; otherwise with `checker.workers` greater than 1 and `proc_open` usable it starts that many `bin/check-worker.php <k>/<n> [--first-pass] [--limit=<m>]` children (PHP binary from `PHP_BINARY`), waits for all, and prints one summed line `workers=<n> checked=<n> passed=<n> failed=<n> guarded=<n> voided=<n> bytes=<n>`; with one worker or no `proc_open` it runs worker 0 of 1 in the same process. `bin/check-worker.php` is the child: its own DB connection, no lock, prints its line. Only counts and fixed words are printed; failures print `check failed` to stderr and exit 1 (as `fetch-logos.php`); a bad argument prints a usage line and exits 2.

- [ ] **Step 1: Failing tests** (same harness as `RefreshCliTest`, real MariaDB): `--status` on a fresh database prints `mode=shadow paused=0 checked=0 eligible=<n>`; `--pause` then `--status` prints `paused=1` and a run prints `skipped`-free output with `checked=0` (paused workers do nothing); a held `RunLock::CHECKER` (taken on a second connection) makes the launcher print `skipped (another run is active)` and exit 0; a bad argument exits 2; with `checker.workers` = 2 in the test config and no due streams, the launcher starts two children and prints `workers=2 checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0` (the slicing itself, and every network path, are proved by Task 8's fake-transport tests, not here); with `checker.workers` = 1 it prints `workers=1 ...`; output never contains an address.
- [ ] **Step 2:** Run `--filter CheckCliTest`. Expected: FAIL.
- [ ] **Step 3:** Implement both scripts.
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: bin/check-streams.php starts the workers, bin/check-worker.php is one of them`.

---

### Task 10: Apply, the admin API and the Playlist rows

**Files:**
- Create: `server/src/Admin/CheckerAdmin.php`
- Modify: `server/src/Admin/AdminController.php`, `server/src/Admin/PlaylistAdmin.php`, `server/src/Container.php`
- Test: `server/tests/CheckerAdminTest.php`, `server/tests/AdminApiTest.php`

**Interfaces:**
- Produces: `CheckerAdmin::__construct(PDO $pdo, StreamStore $store, AuditStore $audit, CheckerState $state, SnapshotWriter $snapshot, Clock $clock, int $dailyCapBytes, int $firstPassCapBytes)`; `status(): array`; `apply(): array`; `setPaused(bool $paused): array`.
- `status()` returns exactly: `mode` (`shadow` or `live`), `applied_at` (string|null), `paused` (bool), `progress` {`eligible`, `checked`, `oldest_result_at`}, `outcome` (map code => count over the eligible streams' latest results), `would_hide` (int: streams Apply would hide), `counts` (map state => count), `clusters` (list of {`host`,`streams`,`failed`}), `guarded_hosts` (list of {`host`,`streams`}), `flagged` (list of {`public_id`,`name`,`pinned`,`is_default`,`state`}), `budget` {`bytes_today`,`daily_cap`,`first_pass_bytes`,`first_pass_cap`}, `last_stop` (null or {`reason`,`at`}).
- `apply()` returns `['ok'=>true, 'hidden'=>int, 'listed'=>int, 'snapshot'=>bool]` (plus `'already'=>true` and no change on a second press) or `['ok'=>false,'error'=>'refused','reason'=>'incomplete'|'stale'|'too_many_failures']` (incomplete: an eligible stream has no recorded result of any code; stale: the oldest result is older than 3 days; too_many_failures: two thirds or more of the results are failures). In one transaction it runs `StateMachine::next` over each eligible stream's recorded result (rebuilt as `new CheckResult($row['check_result'])`) and writes it with `StreamStore::applyTransition` (so `next_check_at` and `state_changed_at` are set as in a live run), writes the audit row `checker.apply` (counts in the detail), calls `CheckerState::markApplied()`; the snapshot is rewritten after the commit (a failed rewrite gives `snapshot:false`, as `PlaylistAdmin`).
- Routes (owner only, same guard and `Cache-Control: no-store`): `GET /api/admin/checker` (status), `POST /api/admin/checker/apply`, `POST /api/admin/checker/pause`, `POST /api/admin/checker/resume`; a `refused` answer is HTTP 409 `{error:'refused', reason}`. `PlaylistAdmin::present()` adds `last_checked_at` and `check_result` (string|null) to each row.

- [ ] **Step 1: Failing tests.** `CheckerAdminTest`: `status()` on a fresh database (progress 0 of N, `mode` shadow, empty outcome); after recorded results: `outcome`, `would_hide` (never-passed failures plus `no_cors`), a host cluster (4 streams, 3 failed) listed; `apply()` refuses `incomplete`, `stale` (clock 4 days past the oldest result) and `too_many_failures` (two thirds failing) and changes nothing; a good apply hides the failed never-passed streams (`dead(never_passed)`), turns a failed `working` stream into `suspect`, makes passing `held(awaiting_check)` streams `working` and failing ones `dead(never_passed)`, leaves `host_guard`/`voided`/`skipped` streams unchanged, writes one audit row, sets `applied_at`, rewrites the snapshot file once, leaves pins and the default flag untouched; a second `apply()` returns `already` and changes nothing; `setPaused` round-trips into `status()`. `AdminApiTest`: a signed-out request is 401, a non-owner 403, wrong method 405, the four routes return the shapes above, `refused` is 409 with the reason, the list endpoint rows carry `last_checked_at` and `check_result`.
- [ ] **Step 2:** Run `--filter 'CheckerAdminTest|AdminApiTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement; wire `CheckerAdmin` in `Container::router` and add the routes to `AdminController::handle` (bodies are empty JSON objects; reuse `streamAction`'s size and method checks).
- [ ] **Step 4:** Re-run the filter and the whole suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat: Apply, the checker's admin API and the Playlist rows' check result`.

---

### Task 11: The Health screen

**Files:**
- Create: `src/components/admin/HealthScreen.tsx`
- Modify: `src/lib/adminApi.ts`, `src/pages/AdminPage.tsx`, `src/components/admin/AdminShell.tsx`, `src/components/admin/PlaylistScreen.tsx`
- Test: `src/lib/__tests__/adminApi.checker.test.ts` (new, in the style of `adminApi.streams.test.ts`), `src/components/admin/__tests__/HealthScreen.test.tsx` (new), `src/components/admin/__tests__/PlaylistScreen.test.tsx`, `src/components/admin/__tests__/AdminShell.test.tsx` (new)

**Interfaces:**
- Consumes: Task 10's JSON (keys exactly as listed there).
- Produces in `adminApi.ts`: `interface AdminChecker { mode: 'shadow' | 'live'; appliedAt: string | null; paused: boolean; progress: { eligible: number; checked: number; oldestResultAt: string | null }; outcome: Record<string, number>; wouldHide: number; counts: Partial<Record<StreamState, number>>; clusters: { host: string; streams: number; failed: number }[]; guardedHosts: { host: string; streams: number }[]; flagged: { publicId: string; name: string; pinned: boolean; isDefault: boolean; state: StreamState }[]; budget: { bytesToday: number; dailyCap: number; firstPassBytes: number; firstPassCap: number }; lastStop: { reason: string; at: string } | null }`; `getChecker(signal?)`, `applyChecker(signal?): Promise<CheckerApplyResult>` where `CheckerApplyResult = AdminResult<{ hidden: number; listed: number; snapshot: boolean; already: boolean }> | { kind: 'refused_apply'; reason: 'incomplete' | 'stale' | 'too_many_failures' }`, `setCheckerPaused(paused: boolean, signal?)`; `AdminStream` gains `lastCheckedAt: string | null` and `checkResult: string | null`.
- Produces: route `/admin/health`; the nav entry "Health" replaces the "coming later" placeholder.

- [ ] **Step 1: Failing tests.** `adminApi`: `getChecker` parses the full object and a bad shape is `unavailable`; `applyChecker` maps 200 to `ok`, 409 `refused` with a reason to `refused_apply`; `getStreams` rows carry `lastCheckedAt` and `checkResult`. `HealthScreen` (mock `adminApi`): shows "Shadow run" and the progress "3,412 of 3,995 checked", the age of the oldest result, "Apply would hide N streams" with the outcome counts by code, the host clusters (host, streams, failed) with a sentence saying these hosts may be down or blocking the server, the flagged streams, guarded hosts, the budget as megabytes against the cap, paused or running, and a link to the Playlist screen filtered by `?state=dead`; the Apply button asks for a confirmation that states how many streams will be hidden, calls `applyChecker`, shows "Applied: N hidden" and reloads; a `refused_apply` shows the reason in plain words ("The first pass is not finished", "The results are older than 3 days, run it again", "Two thirds or more of the checks failed, so the server's network is the likely cause"); in `live` mode the button is gone and "Applied on <date>" shows; Pause/Resume calls `setCheckerPaused`; an `error` status shows the retry control like the other screens. `PlaylistScreen`: a row shows its last check time and result code ("never checked" when null). Shell test: the nav has a "Health" link to `/admin/health` and no "coming later" text.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** Implement with `useAdminResource` and the existing admin styles (`StatTile`, `BudgetBars` where they fit; match `PlaylistScreen`).
- [ ] **Step 4:** Re-run the files, then `pnpm exec tsc -b` and the whole front-end suite. Expected: pass, no type errors.
- [ ] **Step 5: Commit** `feat: the Health screen shows the checker's first pass and applies it`.

---

### Task 12: The checker's public page

**Files:**
- Create: `public/stream-checker/index.html`
- Test: `src/__tests__/streamCheckerPage.test.ts`; `server/tests/ConfigTest.php` (a line pinning the default user agent's URL to this path)

**Interfaces:**
- Produces: a static page served at `https://prism.nooroticx.tv/stream-checker/` (a plain HTTP 200; the app's `404.html` single-page fallback is not involved because the file exists).

- [ ] **Step 1: Failing test.** Read `public/stream-checker/index.html` with `node:fs`: it starts `<!doctype html>`, has `<meta charset>`, a viewport meta, a `<title>` of two to four words, and a body that contains: the user agent string `PRISM-StreamChecker`, the words "once a day", "one request a second", the origin `https://prism.nooroticx.tv`, "stores only pass or fail" (or equivalent wording, assert the phrase you write), and a link to `https://github.com/NooRotic/prism/issues/new`; it contains no email address (no `@`) and no external script or stylesheet. The Config test asserts the default user agent contains `https://prism.nooroticx.tv/stream-checker/`.
- [ ] **Step 2:** Run `node ./node_modules/vitest/vitest.mjs run src/__tests__/streamCheckerPage.test.ts` and the ConfigTest filter. Expected: FAIL (file missing).
- [ ] **Step 3:** Write the page: self-contained HTML and inline CSS, light and dark, readable at phone width, saying what the checker is, what it does (reads a stream's playlist and its first few kilobytes of video once a day with an `Origin` header naming PRISM, at most one request a second to a stream's own host, stores only pass or fail), and how to ask for a stream's removal (the GitHub issues link).
- [ ] **Step 4:** Re-run both. Then `pnpm build` and confirm `dist/stream-checker/index.html` exists. Expected: pass.
- [ ] **Step 5: Commit** `feat: the checker's public page`.

---

### Task 13: Documentation and the rollout notes

**Files:**
- Modify: `server/README.md`, `docs/superpowers/specs/2026-11-13-playlist-admin-design.md`, `CLAUDE.md`

- [ ] **Step 1:** In `server/README.md` add "The checker": the commands (`check-streams.php`, `check-worker.php`, `rejudge-held.php`), the config keys with defaults, the cron line pattern (one entry for `check-streams.php`, `/usr/bin/php8.4-cli`), the shadow-then-Apply flow, the two caps and the kill switch, the output being counts and codes only, and the owner-gated rollout order from the design ("Migration and deploy; rejudge dry run, then for real; probe the host with 2 workers; the shadow first pass in one sitting; review the Health screen and press Apply; enable the steady cron; remove the logo cron line").
- [ ] **Step 2:** In the parent spec replace the "Other ports" paragraph and the "Guarding what it fetches" sentence about ports 80 and 443 with a pointer to the piece 3a design (ports any https 1024 up minus the restricted list; first pass shadow then Apply), and add a short "Piece 3a as built" section naming the files. In `CLAUDE.md` Key Files add one line each for `server/src/Checker/`, `src/components/admin/HealthScreen.tsx` and `public/stream-checker/`.
- [ ] **Step 3:** Run the whole server suite, the whole front-end suite, `pnpm exec tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`, `pnpm build`. Expected: all green.
- [ ] **Step 4: Commit** `docs: the checker's README, the spec's piece 3a section and the key files`.

---

## Rollout (owner-gated; not tasks, each needs the owner's explicit go)

1. Deploy the server code and run migration `004` (no behaviour change). 2. `rejudge-held.php` dry run, then `--apply`. 3. Probe the host: simultaneous PHP processes and cron entries (start with `checker.workers = 2`). 4. The shadow first pass in one sitting (`check-streams.php --first-pass`). 5. The owner reviews `/admin/health` (progress, outcome, host clusters) and presses Apply. 6. Enable the steady cron entry. 7. Remove the logo copier's cron line when its work is done. The front end (Health screen, public page) ships when the branch's PR is merged; the server steps need the owner's go for each host command.
