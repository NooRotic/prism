# PRISM History Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small PHP service on the owner's IONOS host that remembers daily TwitchTracker snapshots for every channel PRISM visitors open, plus the PRISM front end that shows them.

**Architecture:** A dependency-free PHP 8.4 service in `server/` (`public/index.php` front controller + `bin/` cron and admin scripts + `src/` classes, MariaDB 10.11) deployed to `/prism-data` on `prism-data.nooroticx.tv`. Every outside call goes through an injectable `HttpClient`, so tests drive the real classes over a fake transport. The front end adds `historyApi`, a hook, a trend chart and a history block wired into the existing channel stats slot and dashboard.

**Tech Stack:** PHP 8.4, MariaDB 10.11, PHPUnit 11 (dev only, run in Docker), Node + `ssh2` (deploy tool, dev only), React 19, TypeScript, Tailwind v4, vitest.

**Spec:** [docs/superpowers/specs/2026-11-12-history-server-design.md](../specs/2026-11-12-history-server-design.md) (owner-approved 2026-11-12). Read it first; this plan only records what the spec leaves to the builder.

## Preconditions (owner approvals, stop and ask if missing)

- **P1 (before Task 1):** the owner has approved downloading Docker images `php:8.4-cli`, `mariadb:10.11`, `composer:2` and the Composer dev package `phpunit/phpunit` ^11. Docker Desktop must be running (`docker info` works).
- **P2 (before Task 13):** the owner has approved `npm install --save-dev ssh2` (and its transitive packages).
- **P3 (Task 21 only):** owner creates the database, `/prism-data/config.php` and the cron job. Nothing in Tasks 1-20 touches the host.

## Global Constraints

- **Branch** `feat/history-server`. Commit as each task says, **no co-author line in commit messages** (it goes in the PR description only).
- **Server runtime** has no Composer packages: only `server/src/autoload.php` (a 10-line PSR-4 loader for namespace `Prism\History\` → `server/src/`). Composer exists only for PHPUnit.
- **Time:** every stored time is UTC. `DATETIME` columns hold `Y-m-d H:i:s` UTC; snapshot dates are UTC `Y-m-d`. The PDO session sets `time_zone = '+00:00'` and `sql_mode = 'STRICT_ALL_TABLES'`.
- **Secrets:** `server/config.php` (real) is gitignored and never read, printed, logged or uploaded by any agent. No exception message, log line or API response may contain a secret value.
- **No visitor data:** never store, hash, count or log an IP, user agent or any visitor detail.
- **TT rule (one rule everywhere):** call TwitchTracker for a channel only if it has no `ok` snapshot for today's UTC date, and not if its most recent non-error snapshot is `untracked` and newer than `untracked_recheck_days` (7). Only `https://twitchtracker.com/api/channels/summary/<lowercase login>`. Never an HTML page.
- **TT gate:** every TT call (visit or job) passes `TtGate`: spacing `tt.gap_ms` (1500), run budget 300, day budget 1500 (visit calls count toward the day), first 429 pauses all TT calls for the rest of the UTC day (or `Retry-After` if longer).
- **Config defaults** (all overridable): `tail_days` 30, `new_per_hour` 20, `new_per_day` 200, `visits_enabled` true, `new_channels_enabled` true, `tt.enabled` true.
- **API answers:** tracked → 200 payload; not tracked (unknown, blocked, cap reached, not a real channel) → 404 `{"tracked":false}`; bad login → 400 `{"error":"bad_login"}`; kill switch or Twitch down for an unknown channel → 503. Add `Cache-Control: public, max-age=300` only to a 200 `GET`.
- **Front end:** no new runtime dependencies. Visit pings only from production builds (`import.meta.env.PROD` or `VITE_HISTORY_SEND_VISITS=1`). TT-sourced charts are titled "rolling 30 days"; growth (7/30/90 days) only for total followers and rank. Every place TT numbers show carries the visible credit "Data: TwitchTracker" linking to `https://twitchtracker.com/<login>`. If the server is down, every page looks exactly as it does today.
- **Test commands.** `PHPUNIT` = `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit`. `VITEST` = `node ./node_modules/vitest/vitest.mjs run --maxWorkers=2`. Redirect long output to a file and read it: the rtk wrapper truncates output and masks exit codes, so judge by the printed summary line (`OK (N tests`, `Tests  N passed`), never the exit status.

## Review Focus

Failure modes the spec implies that most likely bite a person using this, each pinned by a test in the owning task:

1. A login renamed and re-taken by someone else must not be answered with the old channel's row (Task 9).
2. Two simultaneous first visits to the same new channel must not error or duplicate (Tasks 7 and 9).
3. TwitchTracker answering with some fields missing, `followers` negative, or very large numbers must round-trip unchanged, with absent fields stored as null, never 0 (Tasks 4 and 7).
4. A run or visit straddling UTC midnight must stamp the right date, and a channel must not get two TT calls in one UTC day (Tasks 7, 9 and 11).
5. The server being slow or down must never block, break or visibly change a PRISM page (Tasks 14, 17, 19).

## File structure

```
server/
  composer.json phpunit.xml Dockerfile.test docker-compose.test.yml .gitignore README.md
  config.example.php deploy.config.example.json
  migrations/001_schema.sql
  public/index.php public/.htaccess
  bin/install.php bin/refresh.php bin/remove-channel.php
  src/ autoload.php Config.php Time.php Clock.php Db.php Migrator.php Logger.php Container.php
       BioLinks.php TtPolicy.php ChannelPayload.php VisitService.php RefreshJob.php
       Http/{HttpClient,HttpResponse,CurlHttp}.php
       Twitch/{TwitchClient,TwitchUser,TwitchChannelInfo,TwitchUnavailable}.php
       Tracker/{TrackerClient,TrackerResult,TtGate,Sleeper,SystemSleeper}.php
       Store/{JobState,ChannelStore,SnapshotStore,BioLinkStore}.php
       Api/{Request,ApiResponse,Router}.php
  tests/ bootstrap.php Support/{DbTestCase,FakeClock,FakeSleeper,FakeHttp}.php fixtures/http/router.php *Test.php
  tools/{deploy.mjs,lib/historyDeploy.mjs,web-install.template.php} tools/__tests__/historyDeploy.test.mjs
src/lib/historyApi.ts  src/lib/historyGrowth.ts  src/config/historyServer.ts
src/hooks/useChannelHistory.ts
src/components/dashboard/TrendChart.tsx  src/components/channel/HistoryBlock.tsx
(modified) src/lib/chartGeometry.ts  src/components/channel/ChannelStatsSlot.tsx
           src/components/dashboard/TwitchDashboard.tsx  README.md  CLAUDE.md  .env.example
```

`server/` mirrors the host: `server/` contents upload to `/prism-data/` (so `server/config.php` ↔ `/prism-data/config.php`, `server/public/` ↔ `/prism-data/public/`).

---

## PART A: Server

### Task 1: Scaffolding and Docker test harness

**Files:** Create `server/{composer.json,phpunit.xml,Dockerfile.test,docker-compose.test.yml,.gitignore,README.md}`, `server/src/autoload.php`, `server/tests/bootstrap.php`, `server/tests/SmokeTest.php`.

**Interfaces:**
- Produces: namespace `Prism\History\` autoloaded from `server/src/`; the `PHPUNIT` command above; test DB reached through env `TEST_DB_HOST=db`, `TEST_DB_NAME=prism_test`, `TEST_DB_USER=root`, `TEST_DB_PASS=test`.

- [ ] **Step 1: Check P1.** Run `docker info`. Expected: server info printed. If the daemon is down or P1 is not granted, stop and ask the owner.
- [ ] **Step 2: Write the failing test** `SmokeTest`: `testRunsOnPhp84` asserts `PHP_VERSION_ID >= 80400`; `testDatabaseIsMariaDb1011` opens PDO from the `TEST_DB_*` env and asserts `SELECT VERSION()` starts with `10.11` and contains `MariaDB`.
- [ ] **Step 3: Run `PHPUNIT`.** Expected: FAIL (compose file not found).
- [ ] **Step 4: Implement the harness.** `Dockerfile.test`: `FROM php:8.4-cli`, install `pdo_mysql` with `docker-php-ext-install`, copy Composer from `composer:2`, `composer install` on build. Compose: `db` = `mariadb:10.11` (env `MARIADB_ROOT_PASSWORD=test`, `MARIADB_DATABASE=prism_test`, healthcheck via `healthcheck.sh --connect`), `php` = build of `Dockerfile.test`, `depends_on: db: condition: service_healthy`, `volumes: ['./:/app']`, `working_dir: /app` (use a named volume or `.dockerignore` so the image's `vendor/` is not shadowed). `phpunit.xml` bootstraps `tests/bootstrap.php` (requires `src/autoload.php`). `.gitignore`: `vendor/`, `config.php`, `*.log`, `deploy.config.json`, `.env`.
- [ ] **Step 5: Run `PHPUNIT`.** Expected: `OK (2 tests`.
- [ ] **Step 6: Commit** `git add server && git commit -m "feat(server): scaffold PHP service and Docker test harness"`.

### Task 2: Config, time, DB, migrator, logger, schema

**Files:** Create `server/src/{Config,Time,Clock,Db,Migrator,Logger}.php`, `server/migrations/001_schema.sql`, `server/config.example.php`, `server/tests/Support/{DbTestCase,FakeClock}.php`, `server/tests/{ConfigTest,TimeTest,MigratorTest,SchemaTest,LoggerTest}.php`.

**Interfaces:**
- Produces:
  - `Config::load(string $path): self`, `Config::fromArray(array $a): self`; getters `db(): array{host,name,user,pass}`, `twitchClientId()`, `twitchClientSecret()`, `allowedOrigins(): list<string>`, `ttEnabled(): bool`, `ttUserAgent(): string`, `ttGapMs(): int`, `ttRunBudget(): int`, `ttDayBudget(): int`, `tailDays(): int`, `newPerHour(): int`, `newPerDay(): int`, `untrackedRecheckDays(): int`, `visitsEnabled(): bool`, `newChannelsEnabled(): bool`, `logPath(): string`. Config array shape: `db{host,name,user,pass}`, `twitch{client_id,client_secret}`, `allowed_origins[]`, `tt{enabled,user_agent,gap_ms,run_budget,day_budget}`, `tracking{tail_days,new_per_hour,new_per_day,untracked_recheck_days}`, `flags{visits_enabled,new_channels_enabled}`, `log_path`. Required: `db.*`, `twitch.*`, `allowed_origins`, `tt.user_agent`, `log_path`.
  - `interface Clock { nowMs(): int }`, `SystemClock`, test `FakeClock(int $ms)` with `set(int)`, `advanceMs(int)`.
  - `Time::datetime(int $ms): string` (`Y-m-d H:i:s` UTC), `Time::date(int $ms): string`, `Time::parseDatetime(string $utc): int` (ms).
  - `Db::connect(array $db): \PDO`. `Migrator::__construct(\PDO, string $dir)`, `run(): list<string>` (versions applied this run). `Logger::__construct(string $path, Clock)`, `info(string $event, array $counts = []): void`.
  - Tables (migration `001_schema.sql`): `schema_migrations(version PK, applied_at)`; `channels(twitch_id VARCHAR(20) PK, login VARCHAR(25) NOT NULL INDEX (not unique), display_name, avatar_url, broadcaster_type, account_created_at, language, category, first_seen_at, last_visited_at, tracked_since DATE, status ENUM('tracking','dormant','gone'), profile_checked_at NULL)`; `snapshots(twitch_id, snap_date DATE, tt_rank INT NULL, minutes_streamed INT NULL, avg_viewers INT NULL, max_viewers INT NULL, hours_watched BIGINT NULL, followers_change INT NULL signed, followers_total BIGINT NULL, tt_status ENUM('ok','untracked','error'), fetched_at DATETIME, PRIMARY KEY(twitch_id, snap_date))`; `bio_links(id AUTO PK, twitch_id, platform ENUM('youtube','kick'), url VARCHAR(255), first_seen_at, last_seen_at, UNIQUE(twitch_id, platform, url))`; `blocked_channels(twitch_id PK, login, blocked_at)`; `job_state(k VARCHAR(64) PK, v TEXT, updated_at)`; `tt_gate(id TINYINT PK, last_call_ms BIGINT)` seeded with `(1, 0)`.
  - `DbTestCase` (base): `setUp` drops all tables and runs the real migrations; exposes `$this->pdo`, `$this->clock` (FakeClock at 2026-11-12T03:00:00Z).

- [ ] **Step 1: Write failing tests.**
  - `ConfigTest`: `testFromArrayAppliesDefaults` (gap 1500, run budget 300, day budget 1500, tail 30, hour cap 20, day cap 200, recheck 7, all flags true); `testMissingRequiredKeyNamesTheKeyButNotASecret` (drop `db.name`, set `twitch.client_secret` to `S3CRET`; message contains `db.name`, not `S3CRET`); `testLoadRejectsFileThatDoesNotReturnAnArray`; `testAllowedOriginsMustBeAList`.
  - `TimeTest`: `testDatetimeAndDateAreUtc` (ms of 2026-11-12T03:00:00Z → `2026-11-12 03:00:00`, `2026-11-12`); `testDateRollsAtUtcMidnight` (2026-11-12T23:59:59.999Z vs 2026-11-13T00:00:00.000Z).
  - `MigratorTest`: `testAppliesPendingMigrationsInOrderOnce`; `testSecondRunAppliesNothing` (returns `[]`, one `schema_migrations` row per file); `testFailedMigrationIsNotRecorded` (temp dir: `001_ok.sql`, `002_bad.sql` with invalid SQL; first recorded, second throws and is absent).
  - `SchemaTest` (extends `DbTestCase`): `testSnapshotKeyIsIdAndDate` (second insert same id+date fails), `testLoginIsNotUnique` (two channels same login both insert), `testStatusRejectsUnknownValue`, `testBioLinkUniquePerChannelPlatformUrl`, `testTtGateRowIsSeeded`.
  - `LoggerTest`: `testWritesOneLinePerCall`, `testDropsNonScalarValues`, `testDropsKeysThatLookLikeSecrets` (keys matching `/secret|pass|token|key|auth/i` are dropped).
- [ ] **Step 2: Run `PHPUNIT --filter 'ConfigTest|TimeTest|MigratorTest|SchemaTest|LoggerTest'`.** Expected: FAIL (classes not found).
- [ ] **Step 3: Implement** the files above per the Interfaces block. `Config` error messages name only the dotted key path. `Migrator` runs each `NNN_*.sql` with `PDO::exec` in filename order, records the version only after success. `Db::connect` uses `utf8mb4`, exceptions, assoc fetch, `SET time_zone='+00:00'`, `SET sql_mode='STRICT_ALL_TABLES'`.
- [ ] **Step 4: Run the same filter.** Expected: `OK (` with all tests green.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): config, time, migrations, schema, logger"`.

### Task 3: JobState and TtGate

**Files:** Create `server/src/Store/JobState.php`, `server/src/Tracker/{TtGate,Sleeper,SystemSleeper}.php`, `server/tests/Support/FakeSleeper.php`, `server/tests/{JobStateTest,TtGateTest}.php`.

**Interfaces:**
- Consumes: `Clock`, `Time`, `Db`.
- Produces: `JobState::__construct(\PDO, Clock)`; `get(string $k): ?string`; `set(string $k, string $v): void`; `incr(string $k): int` (atomic upsert, returns new value); `delete(string $k): void`. `interface Sleeper { sleepMs(int): void }`; test `FakeSleeper(FakeClock)` advances the clock. `TtGate::__construct(\PDO, Clock, Sleeper, JobState, int $gapMs, int $runBudget, int $dayBudget, int $maxWaitMs = 3000)`; `acquire(bool $forScheduledRun): bool` (waits for its turn, then counts the call and returns true; false when paused, a budget is spent, or no turn is available within `$maxWaitMs`, in which case nothing is counted); `pauseForRestOfDay(?int $retryAfterSeconds): void`; `resetRun(): void`. Keys: `tt_calls:YYYY-MM-DD` (day count), `tt_run_calls`, `tt_paused_until_ms`. Turn claim: `UPDATE tt_gate SET last_call_ms=:now WHERE id=1 AND last_call_ms <= :now - :gap` succeeds only if rowCount is 1.

- [ ] **Step 1: Write failing tests.** `JobStateTest`: `testGetMissingReturnsNull`, `testSetOverwrites`, `testIncrIsAtomicAcrossTwoInstances`. `TtGateTest`: `testFirstCallPassesImmediately`, `testSecondCallWaitsForTheGap` (fake sleeper total ≥ 1500 ms), `testGivesUpWhenTheTurnIsFurtherAwayThanMaxWait` (returns false and the day count is unchanged), `testRunBudgetStopsScheduledRunCallsButNotVisits` (budget 2: third `acquire(true)` false, `acquire(false)` true), `testDayBudgetStopsEveryCall`, `testPauseBlocksUntilNextUtcMidnight`, `testPauseHonoursRetryAfterWhenLonger`, `testTwoGateInstancesOnOneDatabaseShareTheGap`.
- [ ] **Step 2: Run `PHPUNIT --filter 'JobStateTest|TtGateTest'`.** Expected: FAIL (classes not found).
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): job state and the shared TwitchTracker gate"`.

### Task 4: HTTP transport and TrackerClient

**Files:** Create `server/src/Http/{HttpClient,HttpResponse,CurlHttp}.php`, `server/src/Tracker/{TrackerClient,TrackerResult}.php`, `server/tests/Support/FakeHttp.php`, `server/tests/fixtures/http/router.php`, `server/tests/{TrackerClientTest,CurlHttpTest}.php`.

**Interfaces:**
- Produces: `interface HttpClient { request(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutSec = 10): HttpResponse }`. `final class HttpResponse { __construct(public int $status, public string $body, public array $headers = []) }` (header names lower-cased). `CurlHttp` implements it (status 0 on network failure or timeout, never throws). Test `FakeHttp::__construct(array $routes)` where a route key is `"METHOD url-prefix"` and the value is an `HttpResponse`, a list of them (consumed in order) or a callable `(array $req): HttpResponse`; it records `$requests` as `['method','url','headers','body']` and throws on an unmatched request. `TrackerResult::{OK,UNTRACKED,ERROR,RATE_LIMITED}` constants; `TrackerResult(string $kind, ?array $summary = null, ?int $retryAfter = null)` where `summary` keys are `rank, minutes_streamed, avg_viewers, max_viewers, hours_watched, followers, followers_total` (int or null). `TrackerClient::__construct(HttpClient, string $userAgent)`; `channelSummary(string $login): TrackerResult`.

- [ ] **Step 1: Write failing tests.** `TrackerClientTest`: `testOkMapsEveryField` (body `{"rank":217,"minutes_streamed":5658,"avg_viewers":7372,"max_viewers":14676,"hours_watched":695155,"followers":-3745,"followers_total":11292376}` → those ints, `followers` stays negative); `testEmptyObjectIsUntracked`; `testMissingOrNonNumericFieldsBecomeNullNotZero`; `testStatus429IsRateLimitedAndParsesRetryAfter`; `testStatus500AndInvalidJsonAreErrors`; `testRequestsOnlyTheApiUrlWithLowercasedLoginAndSendsTheUserAgent` (URL equals `https://twitchtracker.com/api/channels/summary/shroud`, header `User-Agent` equals the configured one); `testBadLoginMakesNoRequest` (e.g. `a b`, `../x`, 26 chars → ERROR, zero requests). `CurlHttpTest` (spawns `php -S 127.0.0.1:<free port> -t tests/fixtures/http` in `setUpBeforeClass`, kills it after): `testReturnsStatusBodyAndLowercasedHeaders`, `test429CarriesRetryAfter`, `testTimeoutReturnsStatusZero` (route sleeps 3 s, timeout 1 s), `testConnectionRefusedReturnsStatusZero`.
- [ ] **Step 2: Run `PHPUNIT --filter 'TrackerClientTest|CurlHttpTest'`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Login pattern `^[a-z0-9_]{1,25}$` after lower-casing. `CurlHttp` sets `CURLOPT_FOLLOWLOCATION` false, `CURLOPT_CONNECTTIMEOUT` min(timeout, 8), TLS verification on.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): HTTP transport and TwitchTracker client"`.

### Task 5: TwitchClient

**Files:** Create `server/src/Twitch/{TwitchClient,TwitchUser,TwitchChannelInfo,TwitchUnavailable}.php`, `server/tests/TwitchClientTest.php`.

**Interfaces:**
- Consumes: `HttpClient`, `FakeHttp`, `JobState`, `Clock`.
- Produces: `TwitchUser(public string $id, public string $login, public string $displayName, public ?string $avatarUrl, public string $broadcasterType, public ?string $createdAt /* UTC Y-m-d H:i:s */, public string $description)`. `TwitchChannelInfo(public string $id, public ?string $language, public ?string $category)`. `TwitchUnavailable extends \RuntimeException`. `TwitchClient::__construct(HttpClient, JobState, Clock, string $clientId, string $clientSecret)`; `usersByLogin(array $logins): array<string,TwitchUser>` keyed by lower-case login; `usersById(array $ids): array<string,TwitchUser>` keyed by id; `channelsById(array $ids): array<string,TwitchChannelInfo>` keyed by id. Batches of 100 (`login=`, `id=`, `broadcaster_id=` repeated). Token: `POST https://id.twitch.tv/oauth2/token` with `grant_type=client_credentials`, cached in `JobState` key `twitch_token` as JSON `{access_token, expires_at_ms}`, refreshed when within 60 s of expiry; one refresh-and-retry on a 401.

- [ ] **Step 1: Write failing tests** (over `FakeHttp`): `testFetchesATokenOnceAndReusesIt`; `testRefreshesAnExpiredToken`; `test401RefreshesOnceThenSucceeds`; `testSecond401Throws TwitchUnavailable`; `testThe130LoginsGoInTwoRequestsOf100And30`; `testMissingUsersAreOmitted`; `testMapsUserFieldsAndConvertsCreatedAtToUtcDatetime`; `testChannelsByIdMapsLanguageAndCategory`; `test5xxAndNetworkStatus0ThrowTwitchUnavailable`; `testNoExceptionMessageContainsTheSecretOrTheToken`.
- [ ] **Step 2: Run `PHPUNIT --filter TwitchClientTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): Twitch client with cached app token"`.

### Task 6: BioLinks

**Files:** Create `server/src/BioLinks.php`, `server/tests/BioLinksTest.php`.

**Interfaces:**
- Produces: `BioLinks::extract(string $description): list<array{platform:'youtube'|'kick', url:string}>`; pure, normalised to `https://` with no trailing punctuation, deduplicated, at most 5 per platform.

- [ ] **Step 1: Write failing tests:** `testFindsYoutubeHandleChannelCAndUserUrls`; `testFindsKickChannel`; `testAddsHttpsAndStripsTrailingPunctuation` (`youtube.com/@x),` → `https://www.youtube.com/@x`; keep the host as written but force `https`); `testIsCaseInsensitiveOnTheHost`; `testIgnoresLookalikesAndVideoLinks` (`notyoutube.com/@x`, `kick.com.evil.io/x`, `youtube.com/watch?v=abc`, `youtu.be/abc`); `testDeduplicates`; `testCapsAtFivePerPlatform`; `testEmptyAndNoLinks` (returns `[]`).
- [ ] **Step 2: Run `PHPUNIT --filter BioLinksTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** with a regex over whitespace-separated tokens; path allow-lists: YouTube `/@handle`, `/channel/ID`, `/c/name`, `/user/name`; Kick `/name`.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): extract YouTube and Kick links from a bio"`.

### Task 7: Stores and TtPolicy

**Files:** Create `server/src/Store/{ChannelStore,SnapshotStore,BioLinkStore}.php`, `server/src/TtPolicy.php`, `server/tests/{ChannelStoreTest,SnapshotStoreTest,BioLinkStoreTest,TtPolicyTest}.php`.

**Interfaces:**
- Consumes: `TwitchUser`, `TwitchChannelInfo`, `Clock`, `Time`, `DbTestCase`.
- Produces:
  - `ChannelStore::__construct(\PDO, Clock)`: `findById(string): ?array`; `findByLogin(string): ?array` (newest `last_visited_at` when a login repeats); `insertTracked(TwitchUser, ?TwitchChannelInfo): void` (idempotent: a duplicate id is ignored, no exception); `applyProfile(string $id, TwitchUser, ?TwitchChannelInfo): void` (updates login, name, avatar, type, language, category, `profile_checked_at` = now, and sets a `gone` channel back to `tracking`); `touchVisit(string $id): void` (writes `last_visited_at` at most once per hour, but a dormant channel is set to `tracking` immediately); `markGone(string $id): void`; `markDormantOlderThan(int $tailDays): int` (count); `countNewSince(string $utcDatetime): int` (by `first_seen_at`); `isBlockedId(string): bool`, `isBlockedLogin(string): bool`, `block(string $id, string $login): void`; `trackingWithoutOkSnapshotFor(string $utcDate): list<array>` (status tracking, no `ok` snapshot that date, ordered never-fetched first then oldest latest `fetched_at`); `remove(string $id): void` (channel, snapshots, bio links).
  - `SnapshotStore::__construct(\PDO, Clock)`: `upsert(string $id, string $date, array $summary, string $ttStatus): void` (`$summary` is the TrackerResult summary or `[]`; maps `rank` to `tt_rank` and `followers` to `followers_change`; replaces the row for that date; stamps `fetched_at` = now); `hasOkFor(string $id, string $date): bool`; `latestNonError(string $id): ?array`; `latest(string $id): ?array`; `history(string $id, ?int $days): list<array>` oldest first (`null` = all). A row array has keys `date, rank, minutes_streamed, avg_viewers, max_viewers, hours_watched, followers_change, followers_total, tt_status, fetched_at`.
  - `BioLinkStore::__construct(\PDO, Clock)`: `sync(string $id, array $links): void` (new links inserted, present links get `last_seen_at` = now, absent links keep their old `last_seen_at`); `current(string $id): list<array{platform,url}>` (links whose `last_seen_at` equals the channel's newest `last_seen_at`).
  - `TtPolicy::mayCall(SnapshotStore $snapshots, string $id, string $today, int $recheckDays): bool`.

- [ ] **Step 1: Write failing tests.**
  - `ChannelStoreTest`: `testInsertTrackedSetsTrackedSinceToday`; `testInsertTrackedTwiceIsSafe` (two calls, no exception, one row); `testFindByLoginPrefersTheMostRecentlyVisitedRow`; `testApplyProfileRenamesTheLogin`; `testApplyProfileRevivesAGoneChannel`; `testTouchVisitWritesAtMostOncePerHour`; `testTouchVisitWakesADormantChannelAtOnce`; `testMarkDormantOlderThanTailDays` (visited 31 days ago → dormant, 29 days ago → not); `testCountNewSince`; `testBlockedByIdAndByLogin`; `testRemoveDeletesChannelSnapshotsAndLinks`; `testTrackingWithoutOkSnapshotExcludesDormantGoneAndOkToday`; `testOrdersNeverFetchedFirstThenOldest`.
  - `SnapshotStoreTest`: `testUpsertWritesOneRowPerDate`; `testUpsertSameDateReplaces`; `testNegativeChangeNullsAndLargeNumbersRoundTrip` (`followers_change` −3745, `followers_total` 11292376, a null `max_viewers`, `hours_watched` 5 000 000 000); `testHistoryIsOldestFirstAndLimitedByDays`; `testHasOkForIgnoresErrorAndUntrackedRows`; `testSnapshotDateComesFromTheUtcClock` (clock at 23:59:59 vs 00:00:01 UTC passed through `Time::date`).
  - `BioLinkStoreTest`: `testSyncAddsAndBumpsLastSeen`; `testRemovedLinkIsNotCurrentButIsKept`.
  - `TtPolicyTest`: `testNoSnapshotsMayCall`; `testOkTodayMayNot`; `testOkYesterdayMay`; `testErrorTodayMay`; `testUntrackedYesterdayMayNot`; `testUntrackedSevenDaysAgoMay`; `testUntrackedThreeDaysAgoWithErrorTodayMayNot` (an error row does not hide the earlier untracked answer).
- [ ] **Step 2: Run `PHPUNIT --filter 'ChannelStoreTest|SnapshotStoreTest|BioLinkStoreTest|TtPolicyTest'`.** Expected: FAIL.
- [ ] **Step 3: Implement.** `insertTracked` uses `INSERT ... ON DUPLICATE KEY UPDATE twitch_id = twitch_id`. All SQL uses prepared statements.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): channel, snapshot and bio-link stores plus the TT rule"`.

### Task 8: ChannelPayload

**Files:** Create `server/src/ChannelPayload.php`, `server/tests/ChannelPayloadTest.php`.

**Interfaces:**
- Consumes: the three stores, `Clock`, `Time`.
- Produces: `ChannelPayload::__construct(ChannelStore, SnapshotStore, BioLinkStore, Clock)`; `build(string $id, ?int $days = 90, ?string $ttStatusOverride = null): array`. Shape: `{"tracked":true,"login","display_name","avatar_url","broadcaster_type","language","category","tracked_since":"YYYY-MM-DD","last_updated":"…Z"|null,"tt_status":"ok|untracked|error|pending|none","bio_links":[{"platform","url"}],"latest":ROW|null,"history":[ROW]}` where `ROW` = `{"date","rank","minutes_streamed","avg_viewers","max_viewers","hours_watched","followers_change","followers_total","tt_status"}`. `tt_status` comes from the latest snapshot (`none` when there is none) unless overridden (`pending`). `last_updated` is the latest snapshot's `fetched_at` as ISO UTC with `Z`.

- [ ] **Step 1: Write failing tests:** `testShapeAndFieldNames` (exact keys); `testTtStatusNoneWithoutSnapshots`; `testOverridePending`; `testHistoryDefaultsToNinetyDaysAndAllWhenNull`; `testLastUpdatedIsIsoUtcWithZ`; `testBioLinksAreTheCurrentOnes`.
- [ ] **Step 2: Run `PHPUNIT --filter ChannelPayloadTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): channel payload builder"`.

### Task 9: VisitService

**Files:** Create `server/src/VisitService.php`, `server/tests/VisitServiceTest.php`.

**Interfaces:**
- Consumes: `Config`, `ChannelStore`, `SnapshotStore`, `BioLinkStore`, `TwitchClient`, `TrackerClient`, `TtGate`, `TtPolicy`, `BioLinks`, `ChannelPayload`, `Clock`, `Time`.
- Produces: `final class VisitResult { const OK='ok', INVALID='invalid', BLOCKED='blocked', NOT_FOUND='not_found', CAP='cap_reached', DISABLED='disabled', UNAVAILABLE='unavailable'; __construct(public string $outcome, public ?array $payload = null) }`. `VisitService::__construct(Config, ChannelStore, SnapshotStore, BioLinkStore, TwitchClient, TrackerClient, TtGate, ChannelPayload, Clock)`; `visit(string $login): VisitResult`. Flow (spec "Visit"): lower-case and validate `^[a-z0-9_]{1,25}$` → INVALID; `visits_enabled` false → DISABLED; blocked login → BLOCKED; known row: if `profile_checked_at` is older than a day, re-resolve the login with Twitch and, if it now belongs to a different id, treat it as that other channel (known or new); `touchVisit`; unknown: `new_channels_enabled` and the hour/day caps (`countNewSince`) else CAP; Twitch lookup missing → NOT_FOUND; blocked id → BLOCKED; `insertTracked`, bio links; then TT on demand if `tt.enabled`, `TtPolicy::mayCall`, and `TtGate::acquire(false)`; a TT answer is stored with `SnapshotStore::upsert` (`ok`/`untracked`/`error`), a 429 calls `pauseForRestOfDay`, a denied gate leaves the payload `tt_status` `pending`; the result carries `ChannelPayload::build($id, 90, $pendingOrNull)`. A `TwitchUnavailable` for a known channel is ignored (answer from the store); for an unknown channel the outcome is UNAVAILABLE.

- [ ] **Step 1: Write failing tests** (real classes over `FakeHttp`, `FakeClock`, `FakeSleeper`): `testInvalidLoginMakesNoRequests`; `testKillSwitchReturnsDisabled`; `testBlockedLoginIsBlocked`; `testNewRealChannelIsInsertedAndTtFetchedOnTheSpot` (payload `tt_status` `ok`, `history` has today's row); `testUnknownToTwitchIsNotFoundAndNothingIsStored`; `testHourlyCapReturnsCapAndStoresNothing` and `testDailyCap`; `testNewChannelsSwitchOffReturnsCapButKnownChannelsStillAnswer`; `testKnownChannelWithoutTodaysSnapshotFetchesTtOnce` and `testSecondVisitSameDayMakesNoTtCall`; `testUntrackedAnswerIsStoredAndNotAskedAgainWithinSevenDays`; `testRateLimitedAnswerPausesTheGateAndLeavesPending`; `testBusyGateLeavesTtStatusPending`; `testStaleLoginReResolvesAndDoesNotAnswerWithAnotherChannelsRow` (stored `alice` id 1 not checked for 2 days; Twitch now maps `alice` to id 2 → answers channel 2, row 1 untouched); `testTwoVisitsToTheSameNewChannelInARowCreateOneRow`; `testTwitchDownForUnknownChannelIsUnavailable` and `testTwitchDownForKnownChannelStillAnswers`; `testTtDisabledInConfigMakesNoTtCall`; `testVisitJustAfterUtcMidnightNeedsANewTtCall` (a visit at 23:59:59 UTC fetches, one at 00:00:01 the next UTC day fetches again, and a second visit in the same UTC day does not).
- [ ] **Step 2: Run `PHPUNIT --filter VisitServiceTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): visit flow with on-demand TwitchTracker fetch"`.

### Task 10: HTTP layer, front controller, container

**Files:** Create `server/src/Api/{Request,ApiResponse,Router}.php`, `server/src/Container.php`, `server/public/{index.php,.htaccess}`, `server/tests/{RouterTest,FrontControllerTest}.php`.

**Interfaces:**
- Consumes: `VisitService`, `ChannelStore`, `ChannelPayload`, `Config`.
- Produces: `Request(public string $method, public string $path, public array $query, public ?string $origin, public string $body)` with `static fromGlobals(): self`; `ApiResponse(public int $status, public array $headers, public string $body)` with `static json(int $status, array $data, array $headers = []): self` and `emit(): void`; `Router::__construct(Config, VisitService, ChannelStore, ChannelPayload)`; `handle(Request): ApiResponse`. `Container::router(Config, \PDO, ?HttpClient = null): Router`. Routes: `OPTIONS *` → 204 with CORS headers when the origin is allowed; `POST /api/visit` (body is JSON `{"login":"…"}` whatever the Content-Type, because the client sends `text/plain` to avoid a preflight; body over 1024 bytes → 413); `GET /api/channel?login=&days=` (`days` integer 1-3650 or `all`; default 90); anything else 404 `{"error":"not_found"}`, wrong method 405. A request carrying an `Origin` that is not in `allowed_origins` → 403; no `Origin` is processed. `Access-Control-Allow-Origin: <origin>` plus `Vary: Origin` only for allowed origins. Outcome mapping is in Global Constraints (`OK`→200, `BLOCKED|NOT_FOUND|CAP`→404 `{"tracked":false}`, `INVALID`→400, `DISABLED|UNAVAILABLE`→503). Server error → 500 `{"error":"server"}` logged by `Logger` with counts only.

- [ ] **Step 1: Write failing tests.** `RouterTest` (real `VisitService` over fakes): `testOptionsAnswers204WithCorsForAllowedOrigin`; `testDisallowedOriginIs403AndGetsNoCorsHeaders`; `testNoOriginIsProcessed`; `testVisitWithTextPlainBodyReturnsPayload`; `testVisitBadJsonIs400`; `testVisitBodyOver1KbIs413`; `testGetUnknownChannelIs404TrackedFalse`; `testGetKnownChannelIs200WithCacheControl300AndNoCacheOnPost`; `testGetDaysParameterAllAndInvalid` (`days=all` → full history, `days=0` → 400); `testWrongMethodIs405`; `testUnknownPathIs404`; `testResponsesNeverContainConfigSecrets` (serialize every response in the suite and assert no secret substring). `FrontControllerTest` (spawns `php -S 127.0.0.1:<port> -t public` with `PRISM_HISTORY_CONFIG` pointing at a generated test config and the fake-free real classes, only for routes that need no outside call): `testUnknownChannelOverHttp404`, `testOptionsPreflightOverHttp`.
- [ ] **Step 2: Run `PHPUNIT --filter 'RouterTest|FrontControllerTest'`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Config path: `getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'`. `.htaccess`: `Options -Indexes`, rewrite non-files to `index.php`, deny dotfiles.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): HTTP API, CORS and front controller"`.

### Task 11: RefreshJob and bin/refresh.php

**Files:** Create `server/src/RefreshJob.php`, `server/bin/refresh.php`, `server/tests/RefreshJobTest.php`; modify `server/src/Container.php` (add `refreshJob(Config, \PDO, ?HttpClient = null): RefreshJob`).

**Interfaces:**
- Consumes: stores, `TwitchClient`, `TrackerClient`, `TtGate`, `TtPolicy`, `BioLinks`, `Logger`, `Config`, `Clock`.
- Produces: `RefreshJob::__construct(Config, ChannelStore, SnapshotStore, BioLinkStore, TwitchClient, TrackerClient, TtGate, Logger, Clock)`; `run(): array` returning counts `{dormant, gone, profiles, tt_ok, tt_untracked, tt_error, tt_skipped, stopped_by}` where `stopped_by` ∈ `done|budget|rate_limited|twitch_unavailable`. Steps: `TtGate::resetRun()`; `markDormantOlderThan(tail_days)`; take `trackingWithoutOkSnapshotFor(today)` up to the run budget; refresh profiles in batches with `usersById` and `channelsById` (a missing id → `markGone`, found → `applyProfile` + `BioLinkStore::sync(BioLinks::extract(description))`); for each remaining channel with `tt.enabled` and `TtPolicy::mayCall` and `TtGate::acquire(true)`: call TT, `upsert` the snapshot with the status (`error` rows do not count as today's good snapshot); a 429 → `pauseForRestOfDay` and stop; log one line of counts. A channel the run could not reach has no snapshot row and is due again next run.
- `bin/refresh.php`: CLI only (exit if `PHP_SAPI !== 'cli'`), builds via `Container`, prints the counts line, exits 0 on any `stopped_by`, non-zero on an uncaught error.

- [ ] **Step 1: Write failing tests** (real classes over `FakeHttp`): `testRefreshesADueChannelAndWritesOneSnapshotPerDate`; `testRerunTheSameDayMakesZeroTtCalls`; `testAnErrorSnapshotIsRetriedByTheNextRun`; `testUntrackedIsNotAskedAgainUntilSevenDaysPass`; `testStopsAtTheRunBudgetAndTheRestIsTakenNextRun`; `testFirst429PausesTtAndEndsTheRun`; `testMissingFromTwitchIsMarkedGoneAndGetsNoSnapshot`; `testUnvisitedForTailDaysBecomesDormantAndIsNotFetched`; `testRenameUpdatesTheLogin`; `testBioLinksAreSynced`; `testTtDisabledStillRefreshesProfilesAndMakesNoTtCall`; `testTwitchDownEndsTheRunWithoutChangingSnapshots`; `testTheLogLineHasCountsOnlyAndNoSecrets`; `testRunStraddlingUtcMidnightStampsEachChannelWithTheDateOfItsOwnCall` (fake clock advances past midnight between two channels; a channel already `ok` for the new day is skipped).
- [ ] **Step 2: Run `PHPUNIT --filter RefreshJobTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the filter.** Expected: `OK (`.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): scheduled refresh job"`.

### Task 12: Admin scripts and the web-install fallback

**Files:** Create `server/bin/{install.php,remove-channel.php}`, `server/tools/web-install.template.php`, `server/tests/AdminScriptsTest.php`; modify `server/src/Container.php` (add `migrator(Config, \PDO): Migrator`).

**Interfaces:**
- Produces: `php bin/install.php` runs the migrator and prints the versions applied (nothing on a second run); `php bin/remove-channel.php <login>` deletes every channel row with that login (rows, snapshots, links) and adds each to `blocked_channels`, printing the counts. Both are CLI only and read config from `PRISM_HISTORY_CONFIG` or `dirname(__DIR__) . '/config.php'`. `tools/web-install.template.php` is a guarded one-time installer: it contains the placeholder `__TOKEN__`, runs only for `GET ?t=<token>` with the exact token, runs the migrator, prints the versions, and is meant to be deleted straight after.

- [ ] **Step 1: Write failing tests** (run the scripts with `proc_open('php …')` against a test config for the compose database): `testInstallAppliesMigrationsAndIsIdempotent`; `testRemoveChannelDeletesRowsAndBlocksTheLogin`; `testRemoveChannelUnknownLoginPrintsZeroAndExitsZero`; `testScriptsRefuseToRunOverTheWeb` (`PHP_SAPI` guard, exercised by including the file under the `cli-server` SAPI via `php -S`); `testWebInstallerRequiresTheExactToken` (no token and wrong token → 403 and no tables created; right token → tables exist).
- [ ] **Step 2: Run `PHPUNIT --filter AdminScriptsTest`.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run the whole server suite `PHPUNIT`.** Expected: `OK (` with every test green.
- [ ] **Step 5: Commit** `git add server && git commit -m "feat(server): install and remove-channel scripts"`.

### Task 13: Deploy tool (Node)

**Files:** Create `server/tools/lib/historyDeploy.mjs`, `server/tools/deploy.mjs`, `server/deploy.config.example.json`, `server/tools/__tests__/historyDeploy.test.mjs`; modify `package.json` (dev dependency `ssh2` once P2 is granted) and, only if vitest's `include` does not reach `server/tools/__tests__`, `vite.config.ts` `test.include`.

**Interfaces:**
- Produces (in `historyDeploy.mjs`): `planServerUpload(files: string[], remoteDir = 'prism-data'): { dirs: string[]; files: { local: string; remote: string }[] }` keeping only `src/**`, `bin/**`, `migrations/**`, `public/**` and excluding `tests/**`, `vendor/**`, `tools/**`, `composer.*`, `phpunit.xml`, `Dockerfile.test`, `docker-compose.test.yml`, `config.php`, `config.example.php`, `deploy.config*.json`, `*.log`, `.gitignore`, `README.md`; `parseEnv(text)`, `passwordFrom(env, envText)`, `hostKeyMatches(key: Buffer, allowed: string[])` (SHA256 base64 without padding, `SHA256:` prefix optional), `validateConfig(cfg)` (host/user charset, port range, `remoteDir` safe, non-empty `hostKeySha256`). `deploy.mjs` is dry-run unless `--go`, uses `ssh2` password SFTP with the pinned host key, `mkdir` parents first, `fastPut` each file, logs counts only. `deploy.config.json` (gitignored): `{ "ssh": { "host", "user", "port", "hostKeySha256": [], "remoteDir": "prism-data" } }`. Password source order: `IONOS_SSH_PASSWORD` env, then a gitignored `.env`; never logged.

- [ ] **Step 1: Write failing tests** (`// @vitest-environment node`): `plan never contains config.php even when it exists locally`; `plan excludes tests, vendor, tools, composer files and docker files`; `plan sends public files under prism-data/public and src under prism-data/src`; `plan lists directories parents first`; `dry run uploads nothing and says how many files`; `the password never appears in any log line`; `refuses to connect without a pinned host key`; `hostKeyMatches accepts the right fingerprint with or without the SHA256 prefix and rejects another`; `parseEnv handles comments, quotes, equals signs inside values and CRLF`; `password precedence is env over .env and blank counts as unset`; `validateConfig rejects a remoteDir with .. or a trailing slash`.
- [ ] **Step 2: Run `VITEST server/tools/__tests__/historyDeploy.test.mjs`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Reuse the structure of the owner's reference implementation (`C:\Dev\projects\inferno-map\modern-edition\tools\deploy.mjs` and `sftp-upload.mjs`, read for the pattern, not imported). Then run `node ./node_modules/eslint/bin/eslint.js server/tools` and fix any findings.
- [ ] **Step 4: Run the test file.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add server/tools server/deploy.config.example.json package.json package-lock.json vite.config.ts && git commit -m "feat(server): password-SFTP deploy tool for /prism-data"` (omit unchanged paths).

---

## PART B: Front end

### Task 14: historyApi, config and visit gating

**Files:** Create `src/config/historyServer.ts`, `src/lib/historyApi.ts`, `src/lib/__tests__/historyApi.test.ts`; modify `.env.example`.

**Interfaces:**
- Produces: `config/historyServer.ts` exports `HISTORY_ENABLED: boolean` (true), `HISTORY_API_URL: string` (`import.meta.env.VITE_HISTORY_API_URL || 'https://prism-data.nooroticx.tv'`), `SEND_VISITS: boolean` (`import.meta.env.PROD || import.meta.env.VITE_HISTORY_SEND_VISITS === '1'`). `historyApi.ts` exports `type HistoryTtStatus = 'ok'|'untracked'|'error'|'pending'|'none'`; `interface HistoryRow { date: string; rank: number|null; minutesStreamed: number|null; avgViewers: number|null; maxViewers: number|null; hoursWatched: number|null; followersChange: number|null; followersTotal: number|null; ttStatus: 'ok'|'untracked'|'error' }`; `interface ChannelHistory { login: string; displayName: string; avatarUrl: string|null; broadcasterType: string; language: string|null; category: string|null; trackedSince: string; lastUpdated: string|null; ttStatus: HistoryTtStatus; bioLinks: { platform: 'youtube'|'kick'; url: string }[]; latest: HistoryRow|null; history: HistoryRow[] }`; `type HistoryResult = { kind: 'tracked'; data: ChannelHistory } | { kind: 'untracked' } | { kind: 'unavailable' }`; `parseChannelHistory(json: unknown): ChannelHistory | null` (snake_case → camelCase, absent numbers null); `fetchChannelHistory(login: string, signal?: AbortSignal): Promise<HistoryResult>`; `visitChannel(login: string, signal?: AbortSignal): Promise<HistoryResult>`; `loadChannelHistory(login: string, opts: { sendVisit: boolean; signal?: AbortSignal }): Promise<HistoryResult>` (visit, falling back to a plain GET when the visit is `unavailable`; GET only when `sendVisit` is false).

- [ ] **Step 1: Write failing tests** (mock `fetch`): `parseChannelHistory maps the server payload to camelCase and keeps absent numbers null`; `parseChannelHistory returns null for malformed input`; `a 404 with tracked false is untracked`; `a 500, a network error and a 10 second timeout are unavailable and never throw`; `the visit POST sends a JSON string body with Content-Type text/plain, credentials omit and no custom headers`; `the login is lower-cased and an invalid one makes no request and is untracked`; `requests go to HISTORY_API_URL`; `loadChannelHistory with sendVisit false makes only a GET`; `loadChannelHistory falls back to a GET when the visit is unavailable`; `HISTORY_ENABLED false makes no request and is unavailable` (mock the config module).
- [ ] **Step 2: Run `VITEST src/lib/__tests__/historyApi.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** `.env.example` documents `VITE_HISTORY_API_URL` and `VITE_HISTORY_SEND_VISITS`.
- [ ] **Step 4: Run the test file.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add src/config/historyServer.ts src/lib/historyApi.ts src/lib/__tests__/historyApi.test.ts .env.example && git commit -m "feat: history server client"`.

### Task 15: Growth, series and staleness helpers

**Files:** Create `src/lib/historyGrowth.ts`, `src/lib/__tests__/historyGrowth.test.ts`.

**Interfaces:**
- Consumes: `HistoryRow` (Task 14).
- Produces: `type SeriesKey = 'followersTotal'|'rank'|'avgViewers'|'maxViewers'|'hoursWatched'`; `interface SeriesPoint { date: string; at: number; value: number|null }` (`at` = UTC midnight ms); `seriesOf(rows: HistoryRow[], key: SeriesKey): SeriesPoint[]` (every date from first to last, missing dates `null`); `growthOver(rows: HistoryRow[], key: 'followersTotal'|'rank', days: 7|30|90): { delta: number; from: string; to: string } | null` (latest value minus the value on the newest row at or before `latestDate − days`; null when history does not reach back that far or either value is null); `isStale(lastUpdated: string|null, now: number): boolean` (older than 48 hours; null is stale); `formatTrackingSince(trackedSince: string): string` (via `formatAxisDate`); `ROLLING_TITLES` object: `viewers: 'Average and peak viewers, rolling 30 days'`, `hours: 'Hours watched, rolling 30 days'`.

- [ ] **Step 1: Write failing tests:** `seriesOf fills a missing date with null`; `seriesOf keeps the null a row itself has`; `growthOver 30 is the latest minus the value 30 days earlier (100 to 130 gives 30)`; `growthOver returns null when coverage is shorter than the window`; `growthOver uses the newest row at or before the target date when that exact day is missing`; `growthOver for rank is negative when the rank improved`; `isStale is false at exactly 48 hours and true just past it, and true for null`.
- [ ] **Step 2: Run `VITEST src/lib/__tests__/historyGrowth.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test file.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add src/lib/historyGrowth.ts src/lib/__tests__/historyGrowth.test.ts && git commit -m "feat: history growth and series helpers"`.

### Task 16: TrendChart

**Files:** Modify `src/lib/chartGeometry.ts`, `src/lib/__tests__/chartGeometry.test.ts` (extend the existing test file if present, else create it); create `src/components/dashboard/TrendChart.tsx`, `src/components/dashboard/__tests__/TrendChart.test.tsx`.

**Interfaces:**
- Produces: `trendSegments(points: { at: number; value: number|null }[], from: number, to: number, width: number, height: number, opts?: { invert?: boolean; range?: { min: number; max: number } }): { x: number; y: number }[][]` in `chartGeometry.ts` (min-to-max scaling, not zero-based; the line breaks at a null; a flat series sits mid-height; `invert` puts the smallest value at the top; `range` lets several series share one scale); `sharedRange(seriesList: { value: number|null }[][]): { min: number; max: number } | null`. `TrendChart` props `{ series: { points: { at: number; value: number|null }[]; stroke?: string }[]; from: number; to: number; ariaLabel: string; invert?: boolean }`, same 300 × 76 viewBox and axis line as `LineChart`; one `polyline` per segment of two or more points, a `circle` for an isolated point, all series on one shared scale.

- [ ] **Step 1: Write failing tests.** Geometry: `trendSegments breaks the line at a null`; `trendSegments is not zero based (values 1000 to 1010 span the full height)`; `a flat series sits at mid height`; `invert puts the smaller value higher`; `a shared range puts a peak line above an average line`; `points outside the span stay on the edge`. Component: `draws one polyline per run of two or more points`; `draws a circle for a lone point`; `a gap leaves two polylines`; `exposes the aria-label as an img role`; `renders no polyline for fewer than two points total`.
- [ ] **Step 2: Run `VITEST src/lib/__tests__/chartGeometry.test.ts src/components/dashboard/__tests__/TrendChart.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Style with `var(--streamer-text)` and `var(--border-accent)` like `LineChart`.
- [ ] **Step 4: Run the same command.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add src/lib/chartGeometry.ts src/lib/__tests__ src/components/dashboard/TrendChart.tsx src/components/dashboard/__tests__/TrendChart.test.tsx && git commit -m "feat: trend chart with gaps and a shared scale"`.

### Task 17: useChannelHistory

**Files:** Create `src/hooks/useChannelHistory.ts`, `src/hooks/__tests__/useChannelHistory.test.tsx`.

**Interfaces:**
- Consumes: `loadChannelHistory`, `SEND_VISITS`.
- Produces: `type ChannelHistoryState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: ChannelHistory } | { status: 'untracked' } | { status: 'unavailable' }`; `useChannelHistory(login: string | undefined): ChannelHistoryState` (idle with no login; loading until the answer; ignores a stale answer after the login changes or the component unmounts); `resetVisitMemory(): void` (tests). Module memory `Map<login, lastSentMs>`: a visit is sent at most once per login per 30 minutes per tab (a layout flip remounts the body and must not ping again); within the window the hook does a plain GET.

- [ ] **Step 1: Write failing tests** (mock `historyApi`): `idle without a login and makes no request`; `loading then ready with the data`; `untracked and unavailable results map to their states`; `a stale answer after the login changed is ignored`; `the first mount sends a visit when SEND_VISITS is true`; `a remount within 30 minutes does a GET instead of a second visit`; `a remount after 30 minutes visits again`; `no visit is ever sent when SEND_VISITS is false` (mock the config).
- [ ] **Step 2: Run `VITEST src/hooks/__tests__/useChannelHistory.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement** following the cancellation style of `useTrackerSummary`.
- [ ] **Step 4: Run the test file.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add src/hooks/useChannelHistory.ts src/hooks/__tests__/useChannelHistory.test.tsx && git commit -m "feat: useChannelHistory hook with one visit ping per channel per 30 minutes"`.

### Task 18: HistoryBlock

**Files:** Create `src/components/channel/HistoryBlock.tsx`, `src/components/channel/__tests__/HistoryBlock.test.tsx`.

**Interfaces:**
- Consumes: `ChannelHistoryState`, `seriesOf`, `growthOver`, `isStale`, `formatTrackingSince`, `ROLLING_TITLES`, `TrendChart`, helpers `formatWhole`, `formatRank`, `formatSigned`, `formatHours`, `formatAxisDate` from `src/lib/streamerFormat` and `compactCount` from `src/lib/dashboardStats`.
- Produces: `HistoryBlock({ state, now, chartsOnly = false }: { state: ChannelHistoryState; now: number; chartsOnly?: boolean })`. Renders nothing unless `state.status === 'ready'`. When ready: `<section aria-label="Channel history">` with the heading "Last 30 days", the credit link "Data: TwitchTracker" (`https://twitchtracker.com/<encoded login>`, `target="_blank"`, `rel="noopener noreferrer"`), "Tracking since <date>", a stale badge when `isStale`, the chips (Rank, Avg viewers, Peak viewers, Hours streamed, Hours watched, Followers gained, Followers total, each tagged TT, values from `latest`, a dash for null) unless `chartsOnly`, a one-line notice for `ttStatus` `untracked` ("TwitchTracker does not track this channel yet"), `pending` ("TwitchTracker figures are on their way") or `error` ("TwitchTracker figures are unavailable right now"), then four chart panels: total followers (with 7/30/90-day growth for those the history reaches), rank (lower is better, `invert`, with growth), average and peak viewers (one `TrendChart` with two series, titled `ROLLING_TITLES.viewers`), hours watched (titled `ROLLING_TITLES.hours`). A panel with fewer than two points shows its latest figure and no chart. Match the look of `ThirtyDayPanels` (CSS variables `--bg-card`, `--streamer-*`) without refactoring it.

- [ ] **Step 1: Write failing tests:** `renders nothing for idle, loading, untracked and unavailable`; `shows the chips from the latest row using the shared formatters (formatRank(217) and so on)`; `shows the credit link to the channel's TwitchTracker page with rel noopener noreferrer`; `chartsOnly hides the chips but keeps the credit and the charts`; `each untracked, pending and error status shows its own notice`; `shows the stale badge only past 48 hours`; `shows Tracking since and no charts with fewer than two points`; `the viewers and hours charts are titled rolling 30 days and show no growth`; `growth shows for followers and rank only and only for windows the history reaches`; `a gap in the history renders two polylines`.
- [ ] **Step 2: Run `VITEST src/components/channel/__tests__/HistoryBlock.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test file.** Expected: all tests passed.
- [ ] **Step 5: Commit** `git add src/components/channel/HistoryBlock.tsx src/components/channel/__tests__/HistoryBlock.test.tsx && git commit -m "feat: history block with honest rolling-30-day charts"`.

### Task 19: Wire into the channel stats slot and the dashboard

**Files:** Modify `src/components/channel/ChannelStatsSlot.tsx`, `src/components/channel/__tests__/ChannelStatsSlot.test.tsx`, `src/components/dashboard/TwitchDashboard.tsx`, and its existing test (`src/components/dashboard/__tests__/TwitchDashboard*.test.tsx`).

**Interfaces:**
- Consumes: `useChannelHistory`, `HistoryBlock`, existing `StreamerBlock`, `useStreamerStats`, `useNow`.
- Produces: `ChannelStatsSlot` calls `useChannelHistory(channel)` and `useStreamerStats(...)` unconditionally (hook order never changes). On the viewer's own affiliate or partner channel it renders `StreamerBlock` exactly as today followed by `<HistoryBlock chartsOnly>`; on any other channel (signed in or out) it renders `<HistoryBlock>`; it renders nothing (no empty wrapper) unless the history is ready or the viewer's own streamer block applies. `TwitchDashboard` renders `<HistoryBlock chartsOnly>` after its `StreamerBlock` through a small child component `OwnChannelHistory({ login })` that owns the `useChannelHistory(login)` call.

- [ ] **Step 1: Update and add failing tests.** `ChannelStatsSlot` (mock `useChannelHistory`; keep the existing mocks): keep the own-affiliate test and assert `HistoryBlock`'s charts-only section is also present when history is ready; change the three "shows nothing" tests so they assert an empty container only when history is not ready; add `shows the full history block on another channel when ready`, `shows it to a signed-out viewer`, `shows only the charts, not a second chip row, on the viewer's own streamer channel`, `calls useChannelHistory with the route channel on every render path`. Dashboard: `shows the charts-only history block under the streamer block when ready` and `shows nothing extra when the history is unavailable`.
- [ ] **Step 2: Run `VITEST src/components/channel/__tests__/ChannelStatsSlot.test.tsx src/components/dashboard/__tests__`.** Expected: FAIL on the new and changed tests.
- [ ] **Step 3: Implement.** Keep the slot's wrapper classes (`fill-hide flex flex-col gap-4 max-w-[1600px] mx-auto w-full`) so spacing is unchanged.
- [ ] **Step 4: Run the same command.** Expected: all tests passed.
- [ ] **Step 5: Run the full front-end gate:** `VITEST` (whole suite), `node ./node_modules/typescript/bin/tsc -b`, `node ./node_modules/eslint/bin/eslint.js .`, `npm run build`. Expected: suite green, no type errors, 0 ESLint errors, build succeeds.
- [ ] **Step 6: Commit** `git add src && git commit -m "feat: show channel history on every tracked channel and on the dashboard"`.

### Task 20: Docs

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1:** README gains a "History server" section: what it is, `VITE_HISTORY_API_URL` and `VITE_HISTORY_SEND_VISITS`, how to run the server tests (`PHPUNIT`), pointer to the spec and `server/README.md`. `CLAUDE.md` Key Files gains `src/lib/historyApi.ts` (history server client), `src/hooks/useChannelHistory.ts`, `server/` (PHP history service).
- [ ] **Step 2: Run `VITEST` whole suite once more.** Expected: still green.
- [ ] **Step 3: Commit** `git add README.md CLAUDE.md && git commit -m "docs: history server"`.

---

## PART C: Rollout (owner-gated, not TDD)

### Task 21: Deploy and verify on the host

Needs the owner for P3. An executor must stop at each owner step; none of this runs without the owner's go-ahead.

- [ ] **Step 1 (owner):** create a new MariaDB database in the IONOS panel (not either existing one) and create `/prism-data/config.php` from `server/config.example.php` (Twitch client id and secret, database login, allowed origins `https://prism.nooroticx.tv` and `http://localhost:5000`, TT user agent with the owner's contact address, `log_path` outside `public/`). Never pasted into chat. Verify only that the file exists, by name, with `webhosting_list_webspace_directory` (never read it).
- [ ] **Step 2:** create `server/deploy.config.json` from the owner's existing IONOS deploy config (copy host, user, port, host-key pins; set `remoteDir` to `prism-data`) without printing values. Run `node server/tools/deploy.mjs` (dry run). Expected: a file count and no `config.php` in the plan. Then `node server/tools/deploy.mjs --go`. Expected: `DEPLOYED N files`.
- [ ] **Step 3: Install the schema.** Probe whether SSH shell commands work (`node` runner using `ssh2` `exec` with `php -v`). If yes, run `php /prism-data/bin/install.php` over SSH. If not, generate `web-install.template.php` with a random token, upload it to `prism-data/public/`, call it once, then delete it and confirm it returns 404. Expected: migration `001` listed as applied; a second run prints nothing.
- [ ] **Step 4: Smoke test over HTTPS.** `GET https://prism-data.nooroticx.tv/api/channel?login=nobody_here_xyz` → 404 `{"tracked":false}`. `POST /api/visit` with the owner's own login (tracks a real channel) → 200 with `tt_status` `ok` or `untracked`, history of one row. A second POST the same day → same payload, and the log line shows no new TT call. A request from a disallowed `Origin` → 403. `OPTIONS` from `https://prism.nooroticx.tv` → 204 with `Access-Control-Allow-Origin`. Expected: all as listed; record the results in the ledger.
- [ ] **Step 5 (owner):** find the cron limits in the panel and create the scheduled job `php8.4 /prism-data/bin/refresh.php` every few hours (within the host's minimum interval). After the first run, check the log (counts only) via a download of the log file with the owner's OK, or ask the owner to read it. Record the interval and the run time in the spec's open items.
- [ ] **Step 6:** open the PR through the normal flow (feature branch, rebase merge, ccd_pr tools). After merge, the GitHub Pages deploy serves the new front end; check a channel page on `https://prism.nooroticx.tv` in the built-in browser: the history block appears, no CORS errors in the console, one visit request per channel per 30 minutes, none from `localhost`.
- [ ] **Step 7 (owner):** send the TwitchTracker email (draft already given).

Rollback: set `flags.visits_enabled` / `tt.enabled` to false in `/prism-data/config.php` (owner edits) to switch the server's behaviour off without a redeploy; unbinding or deleting the folder leaves PRISM working exactly as before.
