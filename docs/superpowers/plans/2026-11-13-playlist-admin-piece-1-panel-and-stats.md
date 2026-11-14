# PRISM admin panel, piece 1 (panel and stats): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner opens `/admin`, signs in with a permission-less Twitch authorisation, and sees site usage by section, TwitchTracker calls against the day budget, refused admin attempts by name, a list of admin changes, and a Channels page that replaces `remove-channel.php`.

**Architecture:** The existing PHP history server (`server/`) gains a public counting endpoint `POST /api/hit` and a guarded `/api/admin/*` API that asks Twitch who a Bearer token belongs to and accepts only the configured owner. PRISM gains a lazily loaded `/admin` route with its own scope-less sign-in, a page-open ping and five screens.

**Tech Stack:** PHP 8.4 + MariaDB (PHPUnit in Docker, no runtime packages); Vite 6 / React 19 / TypeScript / Tailwind v4 (Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-13-playlist-admin-design.md`, section "Piece 1: panel and stats". Pieces 2 to 4 are not in this plan.

## Global Constraints

- PHP 8.4, `declare(strict_types=1);`, namespace `Prism\History\...` loaded from `server/src/`, no Composer packages at runtime (PHPUnit is dev-only).
- Every stored time is UTC and comes from the injected `Clock` through `Time::datetime()` / `Time::date()`.
- Migration files are re-runnable (`CREATE TABLE IF NOT EXISTS`), statements end with `;` at a line end, no `;` inside strings.
- Answers never contain a config value, a token, the owner id or a secret; unexpected errors log their class name only; the logger takes counts only.
- The only visitor-identifying data the server may hold is the refused-attempts table (Twitch user id, login, first and last attempt, count, flag). No IP, user agent, cookie, or hash of either.
- Admin requests carry `Authorization: Bearer <Twitch token>`, never cookies. Accepted only when the token's user id equals `admin.owner_twitch_id`, its client id equals `admin.frontend_client_id`, and it has **no scopes**.
- Sections, exactly: `home`, `twitch`, `youtube`, `hls-dash`, `chat-popout`, `other`.
- Starting-point numbers: `hit` cap 600 per minute; signed-out count cap 600 per minute; unknown-token Twitch validations 30 per minute; owner validation cached for the shorter of the token's remaining life and 30 minutes; attempts purged after 90 days and capped at 1,000 rows; audit list shows 50, kept 180 days; "Needs a look": refresh silent over 8 hours, calls above 80% of the day budget, a named refused attempt in the last 7 days.
- Refused-person copy, exact: "This page is only for the site owner. Your Twitch name was recorded."
- Front end: text from the server is rendered as text, never as HTML; the admin token lives only in `sessionStorage` under its own key and the viewer token in `localStorage` is never touched; no new runtime dependencies; env vars are `VITE_`-prefixed.
- Do not edit `src/components/search/SmartUrlInput.tsx`, `src/components/player/PlayerHost.tsx` or `src/types/player.ts` (another session owns them).
- Never read, print or commit `config.php`, `prism-data.config.php`, `.env` or `IONOS_SSH_PASSWORD`. The deploy config and `.env` exist only in the main checkout: pass `--config C:/Dev/projects/PRISM/server/deploy.config.json --env-file C:/Dev/projects/PRISM/server/.env`. A new file named exactly `config.php` would be git-ignored (case-insensitively): never name one that.
- Commits carry **no** `Co-Authored-By` line. Work on this branch (or one cut from it), never `main`; do not push or open a PR until the owner asks. Every deploy to the live server is outward-facing: ask the owner first.
- Server tests: `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit --filter <Class>` (full suite: no `--filter`). Front-end tests: `node ./node_modules/vitest/vitest.mjs run <path>` (re-run once on a transient Windows load failure; read "Tests N passed", not the exit code). Type check: `node ./node_modules/typescript/bin/tsc -b`. Run `pnpm install --frozen-lockfile` once in this worktree before the first front-end task.

## Review Focus

Failure modes the spec implies that no single task's headline tests cover; each has a test in the task named in brackets.

1. A malformed `admin.*` value in `config.php` (array, integer-as-text, `'yes'`) must turn the admin side off, never make the public API answer 500. [Task 2]
2. Twitch's validate endpoint answering 5xx or garbage must give 503 and record nothing: an outage must not log or lock out anyone. [Task 6]
3. A Twitch callback with a missing or wrong admin `state`, or an ordinary viewer callback, must leave the viewer token alone and never store an admin token. [Task 10]
4. Page-open counting: `/twitch/a` to `/twitch/b` counts twice, a hash or query change on the same path and any `/admin` path count never, a trailing slash is the same path. [Task 12]
5. Removing a channel twice, or an unknown id, must give 404 with exactly one audit row, and a failing audit write must leave the channel in place. [Task 8]

---

### Task 1: The Authorization header reaches PHP, and the preflight allows it

**Files:**
- Modify: `server/src/Api/Request.php`, `server/src/Api/Router.php`, `server/README.md`; `server/public/.htaccess` only if the probe needs it
- Test: create `server/tests/RequestTest.php`; modify `server/tests/RouterTest.php`

**Interfaces:**
- Produces: `new Request(string $method, string $path, array $query, ?string $origin, string $body, ?string $authorization = null)`; `Request::bearerToken(): ?string` (the token after `Bearer `, scheme case-insensitive, null if absent, empty, containing whitespace, or longer than 200 characters); `Request::fromGlobals()` fills `authorization` from `$_SERVER['HTTP_AUTHORIZATION']`, else `REDIRECT_HTTP_AUTHORIZATION`, else `HTTP_X_PRISM_AUTHORIZATION`. Preflight for any path under `/api/admin/` answers `Access-Control-Allow-Headers: Authorization, Content-Type`; every other path keeps exactly `Content-Type`.

- [ ] **Step 1: Failing tests.** `RequestTest`: `testBearerTokenParsing` (valid, `bearer` lower case, `Basic x`, `Bearer ` empty, `Bearer a b`, 201-character token, null header); `testFromGlobalsReadsTheThreeSourcesInOrder` (set and restore `$_SERVER` keys). `RouterTest::testAdminPreflightAllowsAuthorizationButPublicPathsDoNot` (OPTIONS `/api/admin/session` header list contains `Authorization` and `Content-Type`; OPTIONS `/api/visit` is exactly `Content-Type`).
- [ ] **Step 2: Run** `--filter 'RequestTest|RouterTest'`. Expected: FAIL (`bearerToken` undefined, header list lacks `Authorization`).
- [ ] **Step 3: Implement** the constructor parameter, `bearerToken()`, `fromGlobals()` sources and the admin-path preflight header list in `Router::dispatch`. Run the same filter: PASS.
- [ ] **Step 4: Temporary probe.** In `Router::dispatch` add `GET /api/admin/_probe` answering `{"seen":bool,"source":string|null}` where `source` is the name of the first of the three `$_SERVER` keys that is set (never its value). Commit `chore: temporary Authorization header probe`.
- [ ] **Step 5: Live check (ask the owner before deploying).** `node server/tools/deploy.mjs --go --config … --env-file …`, then `curl -s -H "Origin: https://prism.nooroticx.tv" -H "Authorization: Bearer probe1probe2probe3probe4probe5" https://prism-data.nooroticx.tv/api/admin/_probe`. Expected `{"seen":true,...}`. If `false`: add `RewriteCond %{HTTP:Authorization} .` and `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` above the existing `RewriteCond %{REQUEST_FILENAME} !-f` in `server/public/.htaccess` (keep `FrontControllerTest` passing), redeploy, re-curl. If still `false`, switch the whole feature to the header `X-Prism-Authorization` (add it to the admin preflight list here and to `AUTH_HEADER` in Task 11). If every route fails, **stop and report**: the design's admin side cannot run on this host as written.
- [ ] **Step 6: Remove the probe**, record in `server/README.md` under "IONOS host notes" which source carried the header and any `.htaccess` change, run the full server suite (PASS), commit `feat: the admin API can read the Authorization header`, redeploy (owner OK) and confirm `/api/admin/_probe` now answers 404.

### Task 2: Admin config keys that fail safe, and the owner's id helper

**Files:**
- Modify: `server/src/Config.php`, `server/config.example.php`
- Create: `server/bin/twitch-id.php`
- Test: `server/tests/ConfigTest.php`, `server/tests/AdminScriptsTest.php`

**Interfaces:**
- Produces: `Config::adminEnabled(): bool` (key `admin.enabled`, default true, any non-bool means false); `Config::adminOwnerTwitchId(): ?string` (key `admin.owner_twitch_id`; a string or int of 1 to 20 digits, else null); `Config::adminFrontendClientId(): ?string` (non-empty string else null); `Config::adminActive(): bool` (enabled and both ids non-null). None of them is read by `check()` and none ever throws.

- [ ] **Step 1: Failing tests** in `ConfigTest`: `testAdminIsOffUntilBothIdsAreSet`; `testAnIntegerOwnerIdIsReadAsText` (`1000` gives `'1000'`); `testMalformedAdminKeysTurnAdminOffAndDoNotThrow` (owner id `[]`, `'abc'`, `''`; client id `[]`; enabled `'yes'`; `Config::fromArray` succeeds, `adminActive()` is false, `ttDayBudget()` still 1500). In `AdminScriptsTest`: `testTwitchIdScriptNeedsAValidLoginAndMakesNoRequestOtherwise` (no argument, `a b`, 26 characters: exit 2 and `usage` on stderr) and add `/twitch-id.php` to the "refuse to run over the web" list (404, empty body).
- [ ] **Step 2: Run** `--filter 'ConfigTest|AdminScriptsTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** the four `Config` methods; add to `config.example.php` an `'admin' => ['enabled' => true, 'owner_twitch_id' => '', 'frontend_client_id' => '']` block with a comment that neither id is secret. Implement `bin/twitch-id.php <login>` modelled on `bin/remove-channel.php`: validate with `/^[a-z0-9_]{1,25}$/`, build a `TwitchClient` directly (`new CurlHttp()`, a `JobState` over the connection and `SystemClock`, the configured Twitch client id and secret) and call `usersByLogin`, print `id=<numeric id>`, print `not found` and exit 1 when Twitch has no such user, CLI only.
- [ ] **Step 4: Run** the same filter: PASS. Commit `feat: optional admin config keys and a helper that prints a Twitch id`.

### Task 3: Migration 002, the admin and counter tables

**Files:**
- Create: `server/migrations/002_admin.sql`
- Test: `server/tests/SchemaTest.php`; modify `server/tests/AdminScriptsTest.php` (`testInstallAppliesMigrationsAndIsIdempotent`, the expected installer output)

**Interfaces:**
- Produces (all `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`):
  - `usage_counters(day_utc DATE, k VARCHAR(40), n BIGINT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (day_utc, k))`
  - `admin_attempts(twitch_id VARCHAR(20) PRIMARY KEY, login VARCHAR(25) NOT NULL, first_attempt_at DATETIME NOT NULL, last_attempt_at DATETIME NOT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 1, via_script TINYINT(1) NOT NULL DEFAULT 0, KEY idx_attempts_last (last_attempt_at))`
  - `admin_audit(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, action VARCHAR(40) NOT NULL, target VARCHAR(100) NOT NULL, detail VARCHAR(255) NOT NULL DEFAULT '', KEY idx_audit_at (at))`
  - `admin_token_cache(token_hash CHAR(64) PRIMARY KEY, expires_at DATETIME NOT NULL)`

- [ ] **Step 1: Failing tests** in `SchemaTest`: `testAdminTablesExist`; `testUsageCounterKeyIsDayAndName` (a duplicate `(day_utc, k)` throws); `testAttemptsAreOneRowPerTwitchUser`; `testSecondMigrationCanBeRunAgain` (delete its `schema_migrations` row, run the migrator, expect `['002_admin']`, no error, existing rows kept). Change `testInstallAppliesMigrationsAndIsIdempotent` to expect `"applied 001_schema\napplied 002_admin\n"`.
- [ ] **Step 2: Run** `--filter 'SchemaTest|AdminScriptsTest'`. Expected: FAIL.
- [ ] **Step 3: Write** `002_admin.sql` with the four tables above. Run the same filter, then the full suite: PASS.
- [ ] **Step 4: Commit** `feat: schema for usage counters, refused attempts, the audit list and the token cache`.

### Task 4: Usage counters, the rate cap, `POST /api/hit`, and the new-channels counter

**Files:**
- Create: `server/src/Usage/Sections.php`, `server/src/Store/UsageCounters.php`, `server/src/RateCap.php`, `server/src/Usage/HitRecorder.php`
- Modify: `server/src/Store/JobState.php`, `server/src/Api/Router.php`, `server/src/Container.php`, `server/src/VisitService.php`, `server/tests/VisitServiceTest.php` (constructor)
- Test: create `server/tests/UsageCountersTest.php`, `server/tests/RateCapTest.php`, `server/tests/HitApiTest.php`; modify `server/tests/VisitServiceTest.php`

**Interfaces:**
- Produces:
  - `Sections::ALL` (list of the six names), `Sections::isValid(string): bool`.
  - `UsageCounters::__construct(PDO, Clock)`, `increment(string $key): void` (adds 1 to today's UTC row, one statement), `forDays(int $days, array $keys): array<string date, array<string key, int>>` (today and the previous `days-1` UTC days, oldest first, zero-filled), `valueOn(string $date, string $key): int`. Keys used: `hit:<section>`, `new_channels`, `signed_out`.
  - `JobState::pruneBefore(string $prefix, string $cutoffKey): void` (deletes rows whose key starts with `$prefix` and sorts before `$cutoffKey`; no `LIKE`).
  - `RateCap::__construct(JobState, Clock)`, `allow(string $name, int $perMinute): bool` (counts in a per-minute `cap:<name>:<YmdHi>` job_state row; when a new minute starts it prunes that name's older minutes).
  - `HitRecorder::__construct(UsageCounters, RateCap)`, `record(string $section): string` returning `HitRecorder::OK`, `BAD_SECTION` or `CAPPED`. Cap: 600 per minute, name `hit`.
  - Route `POST /api/hit`: body is JSON `{"section":"…"}` sent as plain text, up to 1 KB; 204 on success; 400 `bad_request` (not JSON, no string `section`) or `bad_section`; 413 `too_large`; 429 `busy` with `Retry-After: 60`; 405 with `Allow: POST, OPTIONS` for other methods. Needs the same allowed-origin rule as the other routes.
  - `VisitService::__construct(..., JobState $state, UsageCounters $counters)`: after `insertTracked` it calls `$counters->increment('new_channels')` inside try/catch (a counter that cannot be written never breaks a visit).

- [ ] **Step 1: Failing tests.** `UsageCountersTest`: `testIncrementAddsToTodaysRow`; `testHitsAtMidnightLandOnDifferentDays` (23:59:59 and 00:00:00 UTC); `testForDaysIsZeroFilledAndOldestFirst`. `RateCapTest`: `testAllowsUpToTheLimitThenRefuses`; `testANewMinuteStartsAgainAndPrunesOldMinutes` (old `cap:hit:` rows gone, a `cap:other:` row kept). `HitApiTest` through `Container::router`: `testAValidSectionAnswers204AndCountsOne`; `testEveryUnknownSectionIs400AndCountsNothing` (`''`, `'Home'`, `'__proto__'`, `'twitch '`, `5`, `['home']`, missing); `testNonJsonAndOversizeBodies` (400, 413); `testTheCapAnswers429AfterTheLimit`; `testWrongMethodIs405`; `testADisallowedOriginIs403`. `VisitServiceTest::testAFirstVisitCountsOneNewChannelAndARepeatCountsNone`; `testAVisitStillSucceedsWhenTheCounterTableIsMissing` (drop `usage_counters` first).
- [ ] **Step 2: Run** `--filter 'UsageCountersTest|RateCapTest|HitApiTest|VisitServiceTest'`. Expected: FAIL (classes missing).
- [ ] **Step 3: Implement** the classes and route as above; wire `UsageCounters`, `RateCap` and `HitRecorder` into `Container::services()` / `Container::router()`; update `VisitServiceTest::service()` to pass a `UsageCounters`.
- [ ] **Step 4: Run** the same filter, then the full suite: PASS. Commit `feat: count page opens per section and new channels per day`.

### Task 5: The refused-attempts store and the audit store

**Files:**
- Create: `server/src/Store/AttemptStore.php`, `server/src/Store/AuditStore.php`
- Test: `server/tests/AttemptStoreTest.php`, `server/tests/AuditStoreTest.php`

**Interfaces:**
- Produces:
  - `AttemptStore::__construct(PDO, Clock)`; `record(string $twitchId, string $login, bool $viaScript): void` (one row per user: first insert sets `attempts` 1, later ones add 1, update `login` and `last_attempt_at`, and `via_script` becomes 1 if any attempt had it; afterwards deletes rows last tried over 90 days ago and, past 1,000 rows, the oldest by `last_attempt_at`); `recent(): list<array{twitch_id:string,login:string,first_attempt_at:string,last_attempt_at:string,attempts:int,via_script:bool}>` (newest first); `countSince(string $utcDatetime): int`. The login is stored only if it matches `/^[A-Za-z0-9_]{1,25}$/`, else as `''`.
  - `AuditStore::__construct(PDO, Clock)`; `record(string $action, string $target, string $detail): void` (truncates to 40, 100 and 255 characters, then deletes rows over 180 days old); `recent(int $limit = 50): list<array{at:string,action:string,target:string,detail:string}>` (newest first).

- [ ] **Step 1: Failing tests.** `AttemptStoreTest`: `testFirstAttemptCreatesARowAndLaterOnesCount`; `testLoginFollowsTheLatestAttempt`; `testTheScriptFlagSticks`; `testRowsOlderThanNinetyDaysArePurged`; `testTheTableIsCappedAtOneThousandDroppingTheOldest`; `testAnOddLoginIsStoredBlank` (`'<b>x</b>'`, 26 characters); `testCountSinceCountsRowsByLastAttempt`. `AuditStoreTest`: `testRecordAndRecentNewestFirstLimitedToFifty` (60 rows, 50 returned); `testRowsOlderThan180DaysArePurged`; `testLongTextIsTruncatedNotRejected`.
- [ ] **Step 2: Run** `--filter 'AttemptStoreTest|AuditStoreTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** both stores (upsert with `ON DUPLICATE KEY UPDATE`, `GREATEST` for the flag; cap with `DELETE … ORDER BY last_attempt_at ASC LIMIT n`). Run: PASS.
- [ ] **Step 4: Commit** `feat: stores for refused admin attempts and the audit list`.

### Task 6: Token validation and the owner guard

**Files:**
- Create: `server/src/Twitch/TokenInfo.php`, `server/src/Twitch/TokenValidator.php`, `server/src/Admin/TokenCache.php`, `server/src/Admin/AdminDecision.php`, `server/src/Admin/AdminGuard.php`
- Modify: `server/tests/Support/World.php`, `server/src/Container.php` (build the guard)
- Test: `server/tests/TokenValidatorTest.php`, `server/tests/AdminGuardTest.php`

**Interfaces:**
- Consumes: `Request::bearerToken()`, `Config::admin*()`, `UsageCounters`, `RateCap`, `AttemptStore`.
- Produces:
  - `TokenInfo(string $clientId, string $userId, string $login, array $scopes, int $expiresInSec)` (public readonly).
  - `TokenValidator::__construct(HttpClient)`; `validate(string $token): ?TokenInfo`: `GET https://id.twitch.tv/oauth2/validate` with `Authorization: OAuth <token>`; null on 401 or when the answer has no user id (an app token); throws `TwitchUnavailable` (status codes only in the message) on any other status or an unreadable body.
  - `TokenCache::__construct(PDO, Clock)`; `isOwner(string $token): bool`; `remember(string $token, int $ttlSeconds): void` (stores `hash('sha256', $token)`, deletes expired rows).
  - `AdminDecision` with `kind` one of `OWNER`, `NOT_FOUND`, `SIGNED_OUT`, `REFUSED`, `BUSY`, `UNAVAILABLE` and `bool $recorded` (true only when a named row was written); `AdminGuard::__construct(Config, TokenValidator, TokenCache, AttemptStore, UsageCounters, RateCap, Clock)`; `authorize(Request): AdminDecision`.
  - `World`: `public array $tokens` and `World::grantToken(string $token, string $userId, string $login, string $clientId, array $scopes = [], int $expiresIn = 14400): void`, a route for `GET https://id.twitch.tv/oauth2/validate` that answers 200 from `$tokens` (by the `OAuth <token>` header) or 401, and `public int $validateStatus = 200` to simulate an outage.
- Decision table (the spec's): inactive config gives `NOT_FOUND` with no Twitch call and nothing recorded; no or misshapen token (not `/^[A-Za-z0-9]{20,64}$/`) gives `SIGNED_OUT`, increments `signed_out` under a 600 per minute cap, no Twitch call; a cached owner token gives `OWNER` with no Twitch call; otherwise, if the 30 per minute `admin-validate` cap is spent, `BUSY` with no Twitch call; Twitch 401 gives `SIGNED_OUT` (counted); Twitch outage gives `UNAVAILABLE`, nothing recorded; valid token: user id is the owner and client id is the front-end one and scopes are empty gives `OWNER` and is cached; a non-owner gives `REFUSED` and a named row (`viaScript` true when it has scopes or another client id); the owner with scopes or another client id gives `REFUSED` and no row.

- [ ] **Step 1: Failing tests.** `TokenValidatorTest`: `testReadsTheFieldsFromTwitchsAnswer`; `testA401IsNull`; `testAnAppTokenWithoutAUserIsNull`; `testOtherStatusesAndGarbageThrowTwitchUnavailableWithoutTheBodyOrToken`. `AdminGuardTest` (one test per row of the decision table, named after it): `testInactiveConfigIsNotFoundWithNoTwitchCall`; `testMissingAndMisshapenTokensAreSignedOutCountedWithNoTwitchCall`; `testTheOwnersPermissionlessTokenIsAcceptedAndCached`; `testACachedTokenNeedsNoTwitchCall`; `testTheCacheHonoursExpiry` (expires in 60 s: valid at 59 s, validated again at 61 s; expires in 99,999 s: cached 30 minutes, not longer); `testTwitchSaying401IsSignedOut`; `testATwitchOutageIsUnavailableAndRecordsNothing` (503 and a garbage 200 body); `testTheValidationCapAnswersBusyButACachedOwnerStillPasses`; `testANonOwnerThroughTheAdminSignInIsRefusedAndNamedNotFlagged`; `testAViewerTokenWithScopesIsRefusedNamedAndFlagged`; `testAForeignClientIdIsRefusedNamedAndFlagged`; `testTheOwnersOwnWrongKindOfTokenIsRefusedButNotLogged`; `testTheLoggedNameComesFromTwitchsAnswer`; `testNothingRecordedContainsTheToken` (scan every table for the token string and its raw form).
- [ ] **Step 2: Run** `--filter 'TokenValidatorTest|AdminGuardTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** the classes in the order Twitch classes, cache, decision, guard. Compare ids as strings with `hash_equals`; read the token only from `Request::bearerToken()`. Run: PASS.
- [ ] **Step 4: Commit** `feat: validate admin tokens with Twitch and accept only the owner`.

### Task 7: The admin API: session and the four read screens

**Files:**
- Create: `server/src/Admin/AdminController.php`, `server/src/Admin/AdminReports.php`
- Modify: `server/src/Api/Router.php`, `server/src/Container.php`, `server/src/RefreshJob.php`, `server/src/Tracker/TtGate.php`, `server/src/Store/JobState.php`, `server/src/Store/ChannelStore.php`
- Test: create `server/tests/AdminApiTest.php`; modify `server/tests/RefreshJobTest.php`, `server/tests/TtGateTest.php`, `server/tests/JobStateTest.php`

**Interfaces:**
- Consumes: `AdminGuard::authorize`, `UsageCounters`, `AttemptStore`, `AuditStore`, `JobState`, `TtGate`, `ChannelStore`, `Config`.
- Produces:
  - `JobState::getByPrefix(string $prefix): array<string,string>`; `TtGate::pausedUntilMs(): ?int` (null when not paused); `RefreshJob` writes `job_state` key `refresh_last_run` = JSON `{at_ms, stopped_by, profiles, gone, dormant, tt_ok, tt_untracked, tt_error, tt_skipped}` after every run that got the lock (not after `already_running`); constructor gains a last `JobState $state`.
  - `Router` hands every path under `/api/admin/` to `AdminController::handle(Request): ApiResponse` after the origin check and the preflight; the controller maps the guard's decision to 404 `{"error":"not_found"}`, 401 `{"error":"signed_out"}`, 403 `{"error":"forbidden","recorded":bool}`, 429 `{"error":"busy"}` with `Retry-After: 60`, 503 `{"error":"unavailable"}`; every admin answer has `Cache-Control: no-store`; a wrong method after authorisation is 405 with `Allow`; an unknown admin path is 404 only for the owner.
  - `GET /api/admin/session` → `{"owner":true,"limits":{"tt_day_budget":int,"tt_run_budget":int,"new_per_day":int,"tail_days":int}}` (the only config values any admin answer may carry).
  - `GET /api/admin/overview` → `{"pages":{"today":int,"yesterday":int},"chart":[{"date":"Y-m-d","pages":int}…14, oldest first],"new_channels":{"last_24h":int},"tt":{"today":int,"paused":bool},"refused":{"named_7d":int,"signed_out_today":int},"needs_attention":[codes]}`; `last_24h` is `ChannelStore::countNewSince(now - 24 h)`; codes are `tt_paused`, `job_stale` (no `refresh_last_run`, or older than 8 hours), `tt_budget_80`, `named_refused_7d`.
  - `GET /api/admin/usage?days=14|30|90` → `{"days":[{"date":"Y-m-d","home":int,"twitch":int,"youtube":int,"hls-dash":int,"chat-popout":int,"other":int}…]}` oldest first, zero-filled; any other `days` is 400 `bad_days`.
  - `GET /api/admin/tt?days=14|30|90` → `{"days":[{"date":"Y-m-d","calls":int}…],"paused_until":"Y-m-d H:i:s"|null,"last_run":{…the stored JSON…}|null}` (calls from the `tt_calls:<date>` job_state rows).
  - `GET /api/admin/security` → `{"signed_out_today":int,"attempts":[AttemptStore::recent()],"audit":[AuditStore::recent(50)]}`.

- [ ] **Step 1: Failing tests** in `AdminApiTest` (through `Container::router`, `World::config(['admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front']])`, owner token via `World::grantToken`): `testEveryAdminPathIsNotFoundWhenTheAdminSideIsOff`; `testNoTokenIs401AndOnlyCountsSignedOut`; `testSessionReturnsOwnerAndTheFixedLimitsOnly`; `testOverviewNumbersAndTheFourNeedsAttentionCodes` (one case per code, plus a quiet state with none); `testNewChannelsUsesTheRollingTwentyFourHours` (first seen 25 h ago excluded, 23 h included); `testUsageIsZeroFilledPerSectionAndRejectsOtherDays`; `testTtListsDaysFromJobStateAndTheLastRun`; `testSecurityListsAttemptsAndTheLatestFiftyChanges`; `testAnUnknownAdminPathIs404OnlyForTheOwner`; `testWrongMethodIs405AfterAuthorisation`; `testNoAdminAnswerContainsTheSecretTheTokenOrTheOwnerId`. Also `RefreshJobTest::testARunRecordsItsCountsAndAnAlreadyRunningOneDoesNot`, `TtGateTest::testPausedUntilIsNullUntilA429`, `JobStateTest::testGetByPrefixReturnsMatchingKeys`.
- [ ] **Step 2: Run** `--filter 'AdminApiTest|RefreshJobTest|TtGateTest|JobStateTest'`. Expected: FAIL.
- [ ] **Step 3: Implement.** `AdminReports` builds the five bodies from the stores (no SQL in the controller); `AdminController` owns routing, decisions and JSON; update `Container::router()` and `Container::refreshJob()` for the new constructor parameters. Run the same filter, then the full suite: PASS.
- [ ] **Step 4: Commit** `feat: admin API with session, overview, usage, TT calls and security`.

### Task 8: The admin API: Channels, Remove and block, Unblock

**Files:**
- Create: `server/src/Admin/ChannelAdmin.php`
- Modify: `server/src/Admin/AdminController.php`, `server/src/Admin/AdminReports.php`, `server/src/Store/ChannelStore.php`, `server/src/Container.php`
- Test: create `server/tests/AdminChannelsTest.php`

**Interfaces:**
- Produces:
  - `ChannelStore::search(string $text, int $limit): list<array>` (rows with `twitch_id, login, display_name, status, tracked_since, last_visited_at` and `tt_status`, the newest snapshot's status or null; matches login or display name containing the text, wildcards escaped; newest visit first), `ChannelStore::blocked(int $limit): list<array{twitch_id,login,blocked_at}>`, `ChannelStore::unblock(string $id): bool`.
  - `ChannelAdmin::__construct(PDO, ChannelStore, AuditStore)`; `removeAndBlock(string $twitchId): bool` and `unblock(string $twitchId): bool`, each in one transaction with its audit row (`channel.remove` target = login, detail `twitch_id=<id>`; `channel.unblock` likewise); false when the id is unknown, with nothing written.
  - `GET /api/admin/channels?q=` (q optional, at most 25 characters of `[A-Za-z0-9_]`, else 400 `bad_query`) → `{"channels":[…up to 100],"blocked":[…up to 200]}`. `POST /api/admin/channels/remove` and `/unblock`, body `{"twitch_id":"<1 to 20 digits>"}` → 200 `{"ok":true}`; 400 `bad_request`; 404 `not_found` for an unknown id.

- [ ] **Step 1: Failing tests** in `AdminChannelsTest`: `testListSearchesLoginAndDisplayNameAndShowsTheLatestTtStatus`; `testListAlsoReturnsTheBlockedChannels`; `testRemoveDeletesRowsBlocksTheLoginAndWritesOneAuditRow` (snapshots and bio links gone, `/api/visit` for that login now answers 404 `tracked:false`); `testRemovingTwiceOrAnUnknownIdIsNotFoundWithOneAuditRowInTotal`; `testAFailingAuditWriteLeavesTheChannelInPlace` (drop `admin_audit`, expect 500 and the channel still present and not blocked); `testUnblockRemovesTheBlockAndAudits`; `testBadBodiesAre400` (missing, non-digit, 21 digits, array); `testANonOwnerCannotRemoveAnything` (403, nothing changed).
- [ ] **Step 2: Run** `--filter AdminChannelsTest`. Expected: FAIL.
- [ ] **Step 3: Implement** the store methods, `ChannelAdmin` (`beginTransaction`, block then remove then audit, `commit`, `rollBack` on any `Throwable` and rethrow) and the three routes. Run `--filter AdminChannelsTest`, then the full suite: PASS.
- [ ] **Step 4: Commit** `feat: Channels screen API, replacing remove-channel over SSH`.

### Task 9: Deploy the server side and check it live (the owner takes part)

**Files:** Modify `server/README.md` (admin config keys, the endpoints, `bin/twitch-id.php`, deploy order).

- [ ] **Step 1: Docs.** Describe in the README: the three `admin.*` keys, "no admin side until both ids are set", the endpoint list from Tasks 4 to 8, and that the usage and admin tables come from migration 002. Commit `docs: admin API notes for the history server`.
- [ ] **Step 2: Deploy (owner OK first).** `node server/tools/deploy.mjs --go --config … --env-file …`, then straight away run the installer over SSH (`/usr/bin/php8.4-cli prism-data/bin/install.php`; expected output `applied 002_admin`). Visits keep working during the few seconds between the two because the new-channels counter never breaks a visit.
- [ ] **Step 3: Owner adds the config.** The owner runs `/usr/bin/php8.4-cli prism-data/bin/twitch-id.php <their login>` over SSH to learn their numeric id, then adds to `/prism-data/config.php` an `'admin' => ['owner_twitch_id' => '<id>', 'frontend_client_id' => '<the VITE_TWITCH_CLIENT_ID value>']` block. Neither value is a secret, but nobody pastes the file into chat.
- [ ] **Step 4: Smoke test.** `curl -i https://prism-data.nooroticx.tv/api/admin/session` (expect 401 now that both ids are set; 404 before); `curl -i -X POST -H "Origin: https://prism.nooroticx.tv" -d '{"section":"home"}' https://prism-data.nooroticx.tv/api/hit` (expect 204; this adds one real count); the same with `{"section":"nope"}` (expect 400); confirm `GET /api/channel?login=<a tracked channel>` still answers 200.

### Task 10: Front end: the admin sign-in library

**Files:**
- Create: `src/lib/adminAuth.ts`
- Modify: `src/config/storageKeys.ts`, `src/lib/twitchAuth.ts` (export `getRedirectUri` only), `src/main.tsx`
- Test: create `src/lib/__tests__/adminAuth.test.ts`

**Interfaces:**
- Produces: storage keys `SESSION_ADMIN_TOKEN: 'prism_admin_token'`, `SESSION_ADMIN_OAUTH_STATE: 'prism_admin_oauth_state'`, `SESSION_ADMIN_RETURN: 'prism_admin_return'`; `ADMIN_STATE_PREFIX = 'admin.'`; `startAdminSignIn(returnPath: string): void` (stores a fresh state `admin.<32 hex from crypto.getRandomValues>` and the return path, which must match `/^\/admin(\/[a-z]+)?$/` else `/admin`, then sets `window.location.href` to the Twitch authorize URL with `client_id`, the same redirect URI as the viewer sign-in, `response_type=token`, `force_verify=true`, an empty `scope`, and the state); `finishAdminSignIn(): void` (called once in `main.tsx` before React renders); `getAdminToken(): string | null`; `clearAdminToken(): void`.
- `finishAdminSignIn` rules: no hash and no query → does nothing; a hash whose state does not start with `admin.` is left untouched (it is a viewer sign-in); `admin.` state equal to the saved one with an `access_token` → saves the token under the admin key only, strips the URL and `history.replaceState`s to the saved return path; `admin.` state that is missing or different → saves nothing, strips the URL; an `error=` callback with an `admin.` state (declined) → clears the pending state, strips the URL, goes to the return path.

- [ ] **Step 1: Failing tests** (load the module fresh with `vi.stubEnv('VITE_TWITCH_CLIENT_ID', …)` and a plain-object `window.location` as `twitchAuth.login.test.ts` does; `setup.ts` backs both storages with one mock, so assert key names, not which storage): `startAdminSignIn` builds the URL with the five parameters and an `admin.` state of 38 characters, saves state and return path, rejects `https://evil.example` and `/admin/../x` as return paths, leaves the viewer keys unset; `finishAdminSignIn`: stores only under the admin key and leaves `twitch_access_token` unset; a wrong state, a missing state and a missing saved state store nothing and strip the hash; an ordinary viewer callback is untouched; a declined callback clears the pending state; `getAdminToken` / `clearAdminToken` round trip.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/adminAuth.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module and keys; export `getRedirectUri` from `twitchAuth.ts` (no other change there); in `main.tsx` call `finishAdminSignIn()` after the imports and before `createRoot`.
- [ ] **Step 4: Run** the test file, then `src/lib/__tests__/twitchAuth.test.ts` and `twitchAuth.login.test.ts`, then the type check: PASS.
- [ ] **Step 5: Commit** `feat: separate permission-less admin sign-in`.

### Task 11: Front end: the admin API client

**Files:**
- Create: `src/lib/adminApi.ts`
- Test: create `src/lib/__tests__/adminApi.test.ts`

**Interfaces:**
- Consumes: `HISTORY_ENABLED`, `HISTORY_API_URL` (`src/config/historyServer.ts`), `getAdminToken()`.
- Produces: `AUTH_HEADER = 'Authorization'` (the one place to change if Task 1 chose the custom header); `AdminResult<T> = { kind: 'ok'; data: T } | { kind: 'signed_out' } | { kind: 'refused'; recorded: boolean } | { kind: 'busy' } | { kind: 'unavailable' }`; types `AdminLimits`, `AdminSession`, `AdminOverview`, `AdminUsage`, `AdminTt`, `AdminSecurity`, `AdminChannels` matching the JSON in Tasks 7 and 8 (camelCase); functions `getSession`, `getOverview`, `getUsage(days: 14 | 30 | 90)`, `getTt(days)`, `getSecurity`, `getChannels(query: string)`, `removeChannel(twitchId: string)`, `unblockChannel(twitchId: string)`, each `(…, signal?: AbortSignal) => Promise<AdminResult<…>>`.
- Behaviour: no stored token → `signed_out` with no request; `HISTORY_ENABLED` false → `unavailable` with no request; the request is `credentials: 'omit'` with `Authorization: Bearer <token>`; 200 with a body that does not match the type → `unavailable`; 401 → `signed_out`; 403 → `refused` with `recorded` from the body; 429 → `busy`; 404, 5xx, a network error or a 10 s timeout → `unavailable`. Never throws.

- [ ] **Step 1: Failing tests** (mock `../../config/historyServer` as `historyApi.test.ts` does; stub `fetch`): header and `credentials` on the call; each status mapping; `recorded` true and false; a malformed 200 body for each of the seven reads is `unavailable`; no token and kill switch make no `fetch` call; POST bodies are `{"twitch_id":"…"}` with `Content-Type: application/json`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/adminApi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** one private `request<T>(path, parse, init)` and seven thin parsers; each parser checks only the fields the screens read.
- [ ] **Step 4: Run** the file and the type check: PASS. Commit `feat: typed client for the admin API`.

### Task 12: Front end: page-open pings

**Files:**
- Create: `src/lib/usageApi.ts`, `src/hooks/usePageHit.ts`
- Modify: `src/App.tsx` (a small `HitReporter` component inside `BrowserRouter`, outside the layout, so the chat pop-out is counted)
- Test: create `src/lib/__tests__/usageApi.test.ts`, `src/hooks/__tests__/usePageHit.test.tsx`

**Interfaces:**
- Produces: `type UsageSection = 'home' | 'twitch' | 'youtube' | 'hls-dash' | 'chat-popout' | 'other'`; `sectionForPath(pathname: string): UsageSection | null` (`/` home; `/twitch` and `/twitch/*` twitch; `/youtube…`; `/hls-dash…`; `/chat/*` chat-popout; anything else, including not-found addresses, `other`; `/admin` and `/admin/*` null; a trailing slash is ignored); `sendHit(section: UsageSection): void` (fire and forget: `fetch(`${HISTORY_API_URL}/api/hit`, { method: 'POST', body: JSON.stringify({ section }), credentials: 'omit', keepalive: true })`, failures swallowed, nothing when `HISTORY_ENABLED` is false); `usePageHit(): void` (sends when `SEND_VISITS` is true and the normalised pathname differs from the last counted one; the first render counts).

- [ ] **Step 1: Failing tests.** `usageApi.test.ts`: the mapping table above including `/twitch/streamer`, `/youtube/abc`, `/hls-dash/custom`, `/chat/streamer`, `/nope`, `/twitch/`, `/admin`, `/admin/usage`; `sendHit` sends one plain-text JSON body without custom headers, swallows a rejected fetch, sends nothing with the kill switch off. `usePageHit.test.tsx` (a `MemoryRouter`, `SEND_VISITS` mocked on): initial render sends once; `/twitch/a` to `/twitch/b` sends twice; `?x=1` or `#h` on the same path sends nothing more; `/twitch` to `/twitch/` sends nothing more; visiting `/admin/security` sends nothing; `SEND_VISITS` false sends nothing.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the module and hook (the last counted path in a ref); mount `<HitReporter />` in `App.tsx` as a sibling of `AppRoutes`.
- [ ] **Step 4: Run** both files, `src/__tests__/AppRoutes.test.tsx` and the type check: PASS. Commit `feat: count page opens per section`.

### Task 13: Front end: the `/admin` route, the shell and the sign-in states

**Files:**
- Create: `src/pages/AdminPage.tsx`, `src/components/admin/AdminShell.tsx`, `src/components/admin/SignInCard.tsx`, `src/components/admin/useAdminResource.ts`, `src/components/admin/AdminSessionContext.ts`
- Modify: `src/AppRoutes.tsx`, `src/__tests__/AppRoutes.test.tsx`
- Test: create `src/pages/__tests__/AdminPage.test.tsx`

**Interfaces:**
- Consumes: Task 10 and Task 11 exports.
- Produces:
  - Route `admin/*` outside the layout, element lazy-loaded (`React.lazy` + `Suspense`), so the admin code is its own chunk.
  - `AdminPage` shows exactly one of: **checking** (while `getSession` runs), **sign-in** (no token or 401; says the page is for the site owner and that signing in records the Twitch name of anyone who is not the owner; a "Sign in as admin" button calling `startAdminSignIn(pathname)`; after a 401 with a stored token it also says "Your admin session ended"), **refused** (403: the exact refused copy when `recorded`, else "This page is only for the site owner."; a "Sign out" button), **unavailable** (429, 404, 5xx, network: "The history server is not answering right now." with a retry button), **ready** (the shell).
  - The shell: a left menu (Overview, Usage, TT calls, Security, Channels as links to `/admin`, `/admin/usage`, `/admin/tt`, `/admin/security`, `/admin/channels`; Playlist and Health shown greyed with `aria-disabled` and the text "coming later"), a "Sign out" button (clears the admin token), a link back to PRISM, and an outlet for the screen; below 768 px the menu becomes a row above the content.
  - `useAdminSession(): { limits: AdminLimits; onExpired(): void }` (context); `useAdminResource<T>(load: (signal) => Promise<AdminResult<T>>, deps): { status: 'loading' | 'ready' | 'error'; data: T | null; reload(): void }`, which calls `onExpired()` when a result is `signed_out` and reports `error` for `busy`, `unavailable` and `refused`.

- [ ] **Step 1: Failing tests** (mock `../../lib/adminApi` and `../../lib/adminAuth`): no token shows the sign-in card and its button calls `startAdminSignIn`; a token and an `ok` session shows the menu with five links and two greyed items; a 401 clears the token and shows "Your admin session ended"; 403 recorded and 403 not recorded show their two texts; `unavailable` shows the retry state and no menu; the sign-out button clears the token and shows the sign-in card. `AppRoutes.test.tsx`: `/admin` and `/admin/usage` render the (mocked) admin page outside the layout and never the not-found page.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the page, shell, card, hook and context; add the lazy route above the layout route in `AppRoutes.tsx`. Screens are placeholders for now: nested `Routes` render the five screen components added in Tasks 14 and 15 (create each as a one-line stub file in this task so the build passes).
- [ ] **Step 4: Run** both files and the type check: PASS. Commit `feat: /admin route with the owner sign-in states and menu`.

### Task 14: Front end: Overview, Usage and TT calls

**Files:**
- Create: `src/components/admin/OverviewScreen.tsx`, `UsageScreen.tsx`, `TtCallsScreen.tsx`, `StatTile.tsx`, `BudgetBars.tsx`, `src/lib/adminFormat.ts` (replacing the stubs from Task 13)
- Test: create `src/components/admin/__tests__/OverviewScreen.test.tsx`, `UsageScreen.test.tsx`, `TtCallsScreen.test.tsx`, `src/lib/__tests__/adminFormat.test.ts`

**Interfaces:**
- Produces: `adminFormat`: `formatCount(n: number): string` (thousands separators), `changeVsYesterday(today: number, yesterday: number): string` ("+12 vs yesterday", "−3 vs yesterday", "same as yesterday"), `weeklyTotals(days: AdminUsage['days']): { weekStart: string; total: number }[]` (ISO weeks, UTC), `toBuckets(days: { date: string; value: number }[]): DayBucket[]` (`at = Date.parse(date)`) for the existing `BarChart`; `BudgetBars({ days, budget, ariaLabel })`, an SVG like `BarChart` with a dashed budget line, computed with `barHeights([...values, budget], …)` so bars and line share one scale.
- `OverviewScreen`: four `StatTile`s (pages opened today with `changeVsYesterday`; new channels "last 24 hours" as `n of <limits.newPerDay>`; TwitchTracker calls `n of <limits.ttDayBudget>` plus "paused" when paused; refused attempts "N named, M signed out today"), a 14-day `BarChart` of pages, and a "Needs a look" box mapping each code to a sentence ("TwitchTracker calls are paused.", "The scheduled refresh has not run in over 8 hours.", "Today's TwitchTracker calls are above 80% of the budget.", "Someone tried the admin sign-in and was refused in the last 7 days.") or "Nothing needs a look." `UsageScreen`: a 14/30/90 switch, a `BarChart` of daily totals, a per-section total table for the window and a weekly totals table. `TtCallsScreen`: a 14/30/90 switch, `BudgetBars` against `limits.ttDayBudget`, the pause state ("calls resume at <time> UTC" or "not paused"), and the last scheduled run's time and counts (or "no run recorded yet").

- [ ] **Step 1: Failing tests.** `adminFormat.test.ts` for the four helpers (a week crossing a year end, a negative change, zero). Each screen test (mock `adminApi`, wrap in a session context): **loading** state, **error** state with a retry that reloads, **ready** content with exact figures, and **empty** content (all zeros: charts still render, "Nothing needs a look.", "no run recorded yet"); `UsageScreen` switching to 30 requests `days = 30`.
- [ ] **Step 2: Run** the four files. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, `StatTile`, `BudgetBars` and the three screens with the existing Tailwind variables (`var(--accent-green)`, `var(--text-primary)`, `var(--border-accent)`); text from the server only through JSX text nodes.
- [ ] **Step 4: Run** the four files, `AdminPage.test.tsx` and the type check: PASS. Commit `feat: Overview, Usage and TT calls screens`.

### Task 15: Front end: Security and Channels

**Files:**
- Create: `src/components/admin/SecurityScreen.tsx`, `ChannelsScreen.tsx` (replacing the stubs)
- Test: create `src/components/admin/__tests__/SecurityScreen.test.tsx`, `ChannelsScreen.test.tsx`

**Interfaces:**
- Consumes: `getSecurity`, `getChannels`, `removeChannel`, `unblockChannel`.
- Produces: `SecurityScreen` lists named refused attempts ("token of <login>", first and last attempt, count, a "not via the admin sign-in" mark), today's signed-out count, and the 50 recent changes (time, action, target, detail). `ChannelsScreen` has a search box (debounced 300 ms, sends `q`), a table (login, display name, status, tracked since, last visited, latest TT status), a per-row "Remove and block" button that opens a confirm dialog saying it cannot be undone, and a "Blocked" list with "Unblock". After a successful action it reloads the list; a 404 shows "That channel is already gone." and reloads.

- [ ] **Step 1: Failing tests.** Security: loading, error, empty ("No refused attempts.", "No admin changes yet."), ready; a login of `<img src=x onerror=alert(1)>` renders as visible text and creates no `img` element; the flag text appears only for flagged rows. Channels: loading, error, empty search result, ready; typing sends one debounced request with `q`; Remove opens the confirm, cancel does nothing, confirm calls `removeChannel` once and reloads; a double click on confirm calls it once; a 404 shows the "already gone" message; Unblock calls `unblockChannel`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** both screens (the dialog is a plain `role="dialog"` element with focus on its cancel button).
- [ ] **Step 4: Run** both files, the whole `src/components/admin` folder, the type check and `node ./node_modules/eslint/bin/eslint.js src`: PASS. Commit `feat: Security and Channels screens`.

### Task 16: Docs, the whole suites, and live acceptance (owner-run)

**Files:** Modify `CLAUDE.md` (Key Files: `src/lib/adminAuth.ts`, `src/lib/adminApi.ts`, `src/lib/usageApi.ts`, `src/pages/AdminPage.tsx`, `server/` admin API), `docs/superpowers/specs/2026-11-13-playlist-admin-design.md` (a line under "Risks and unknowns" recording what Tasks 1 and 16 proved).

- [ ] **Step 1: Everything green.** Full server suite, `node ./node_modules/vitest/vitest.mjs run`, `tsc -b`, `eslint src`: all pass.
- [ ] **Step 2: Owner-run acceptance** (an agent cannot sign in). With the server deployed (Task 9) and the two config lines added: start the dev server with `VITE_HISTORY_API_URL=https://prism-data.nooroticx.tv` and open `http://localhost:5000/admin` (the server's allow-list already includes localhost:5000). (a) Sign in as admin and press Authorize on Twitch's screen: the Overview loads. **If Twitch rejects an empty scope, stop and report** (the "no permissions" rule then needs the owner's decision). (b) Sign out and sign in again: Twitch must show its authorise screen again (`force_verify`). (c) With a second Twitch account, open `/admin` and sign in: it sees "This page is only for the site owner. Your Twitch name was recorded.", and the owner's Security screen then lists that name. (d) Remove and block one channel the owner picks, see it in "Recent changes", then Unblock it. (e) Set `admin.enabled` to `false` in `config.php`: `/api/admin/session` answers 404 and the admin page says the server is not answering; set it back to `true`.
- [ ] **Step 3: Update the memory and the design note**, record any result that differed from the design, commit `docs: piece 1 notes and live acceptance results`. Stop: piece 2 needs its own short check-in with the owner before it is planned.
