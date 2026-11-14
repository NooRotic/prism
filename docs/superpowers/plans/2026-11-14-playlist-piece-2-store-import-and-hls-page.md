# PRISM playlist, piece 2 (store, import, visitor list and the new HLS page): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Where this file lives:** it was written in the shared notes folder because the planning session could not write into another worktree. The first act of the executing session is to copy it to `docs/superpowers/plans/2026-11-14-playlist-piece-2-store-import-and-hls-page.md` in its own worktree (a branch `feat/playlist-store`, cut from the tip of `claude/playlist-admin-design-d6e71d`, the branch of PR #81 that holds piece 1; if #81 has merged by then, cut from `main`) and commit it (`docs: plan for the playlist store, import and HLS page`, no `Co-Authored-By`).

**Goal:** Visitors open the HLS page and see a default stream playing, an "About this stream" panel, and a searchable, filterable list of about 3,000 streams (with logos and country flags) loaded from the history server; the owner's media-demo list is imported once by a command-line script.

**Architecture:** The history server gains a `streams` table, a one-time import (M3U parser, import rules, insert-only), a compact visitor snapshot served through `GET /api/streams`, and a guarded fetcher that copies each logo once. PRISM's HLS page becomes a player plus About panel with a windowed list below, falling back to today's demo list when the server is down. An optional last stage adds the Playlist screen to the admin panel.

**Tech Stack:** PHP 8.4 + MariaDB (PHPUnit in Docker, no runtime packages); Vite 6 / React 19 / TypeScript / Tailwind v4 (Vitest); one new front-end dependency, `flag-icons` (MIT).

**Spec:** `docs/superpowers/specs/2026-11-13-playlist-admin-design.md`, sections "Piece 2" and "The HLS page" (the shared decisions apply). Piece 1 (PR #81) is already built and live on the server.

**Stages (each ends in its own PR; B and C are planned to the same level but may be re-planned after A ships):** **A** the server side (tasks 1 to 11), **B** the HLS page (tasks 12 to 22), **C** the Playlist admin screen (tasks 23 to 25, optional: drop it if the command line is enough).

**Decided with the owner at this plan's check-in (2026-11-14):** the default stream is Big Buck Bunny (Mux, demo id `bbb-hls`); the first visitor list shows every https stream on ports 80 and 443, each marked "unchecked", pinned ones first; the five existing demo HLS/DASH entries are pinned from day one; the Playlist screen is the last stage.

**My calls (the owner should check these):** a stream's public id is the first 12 hex characters of its SHA-256 (page addresses stay short; the full hash is the key); the snapshot also carries each stream's address (the spec's field list omitted it, but playing needs it); the import only inserts (it never edits or revives a known stream); logos are copied by a separate resumable command, not during the import; the visitor snapshot lives outside `public/` and is served by the front controller; the windowed list is hand-built; demo seeds are state `working` (they are known-good test streams); the work is split into three PRs.

## Shared contract (Stage A produces, B and C consume)

`GET /api/streams` (public, origin allowlist, `ETag`, gzip when accepted, `Cache-Control: public, max-age=300`; 503 `{"error":"not_ready"}` until the first import) answers:

```json
{ "v": 1, "generated": "2026-11-14T05:00:00Z", "default": "<public id>",
  "groups": ["Other", "General", "News"],
  "streams": [ { "i": "0123456789ab", "n": "Name", "g": [0, 2], "c": "us", "l": "0123456789ab.png", "k": "hls", "p": 1, "s": "new", "u": "https://host/path.m3u8" } ] }
```

`i` public id, `n` name, `g` indexes into `groups`, `c` lower-case country flag code or null, `l` logo file name (served at `<server>/logos/<file>`) or null, `k` `hls` or `dash`, `p` pinned 0 or 1, `s` state (`new` = unchecked, `working`, `suspect`), `u` the stream address. Streams are ordered pinned first, then by name ignoring case; only states `new`, `working` and `suspect` are listed. New fields may be added later; readers ignore unknown ones.

`streams` table (migration `003_streams.sql`): `id CHAR(64)` primary key (SHA-256 hex of the normalised address), `public_id CHAR(12)` unique, `url VARCHAR(1000)`, `name VARCHAR(200)`, `groups_json VARCHAR(400)` (JSON list of names; "Undefined" is stored as "Other"), `country CHAR(2) NULL`, `kind ENUM('hls','dash')`, `state ENUM('new','working','suspect','dead','removed','unplayable','held') DEFAULT 'new'`, `state_reason VARCHAR(20) NULL` (`http` or `port`), `pinned` and `is_default` (`TINYINT(1)`), `source VARCHAR(60)`, `logo_url VARCHAR(500) NULL`, `logo_file VARCHAR(40) NULL`, `logo_tries TINYINT UNSIGNED DEFAULT 0`, `added_at DATETIME`, `last_checked_at DATETIME NULL`, `facts_json TEXT NULL`.

Facts about the source file (`wsp-sender/public/data/HLS_valid.m3u`, read-only, measured 2026-11-14): 5,234 entries; 57 with `#EXTVLCOPT`; 14 with a token-like query parameter; 0 with a login in the address; 1,176 on `http://`; 772 on ports other than 80 and 443; 3 duplicate addresses; 930 whose id has no country suffix; 70 use `uk`; 121 groups hold several names separated by `;`; 14 `.mpd` entries; 127 lines longer than 400 characters; `tvg-id` is not unique (929 entries share an id with another address), so ids come from the address. The iptv-org project is licensed under the Unlicense (public domain): a courtesy credit is enough.

## Global Constraints

- Everything in piece 1's constraints still holds: PHP 8.4, `declare(strict_types=1);`, namespace `Prism\History\...`, no runtime Composer packages; all stored times UTC via `Clock`/`Time`; re-runnable migrations; no secret, token, config value or host path in any answer or log; never read, print or commit `config.php`, `prism-data.config.php`, `.env` or `IONOS_SSH_PASSWORD`; commits have **no** `Co-Authored-By` line (only PR descriptions carry it); work on `feat/playlist-store`, never `main`; do not push or open a PR until the owner asks; every live deploy or host command needs the owner's OK.
- The server is optional: with it down or the snapshot unreadable, the HLS page shows the existing demo list and every other page is unchanged.
- Visitors' browsers contact only PRISM's own server for logos and flags. Logos are PNG, JPEG, WebP or GIF only (checked by their first bytes, never by name or `Content-Type`), at most 262,144 bytes, never SVG.
- All names, groups and text from the list are shown as text, never as HTML; the About panel shows the stream's **host** only, never its full address (which can carry tokens).
- The import never stores: an address with a login (`user:pass@`), a query parameter named like a token, an entry with `#EXTVLCOPT` player options, or a group matching adult terms. Entries on `http://` are stored as state `unplayable` (reason `http`) and entries on ports other than 80 and 443 as state `held` (reason `port`); neither is listed.
- The fetcher allows only `http`/`https` on ports 80 and 443, resolves names itself, refuses loopback, private, link-local, shared (CGNAT), unique-local and IPv4-mapped addresses, connects to the vetted address, re-vets every redirect (at most 3), and never returns what it fetched to a caller of the HTTP API.
- Do not edit `src/components/player/PlayerHost.tsx`, `src/components/player/VideoJSPlayer.tsx`, `src/types/player.ts` or `src/components/search/SmartUrlInput.tsx` (another session owns them). The player is reused, not changed.
- Existing HLS behaviour from PR #80 keeps working and keeps its tests: a pasted address, `/hls-dash/custom?url=`, `?as=`, the probe and the error and stall cards.
- Server tests: `docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit --filter <Class>` (the Docker run can exceed two minutes; run it with a longer timeout or in the background). Front end: `node ./node_modules/vitest/vitest.mjs run <path>`; type check `node ./node_modules/typescript/bin/tsc -b`; lint `node ./node_modules/eslint/bin/eslint.js src`. Run `pnpm install --frozen-lockfile` once in the worktree before the first front-end task. Deploy: `node server/tools/deploy.mjs --config C:/Dev/projects/PRISM/server/deploy.config.json --go` (the SSH password is in the environment; never read it). The deploy config is not in a fresh worktree; pass its path as shown. Output of `curl` and `cat` on JSON is reshaped by the `rtk` wrapper: use `node -e "fetch(...)"` to see real JSON.

## Review Focus

1. A logo address whose name resolves to a private, loopback or metadata address, or that redirects to one, is never fetched, and no error answer shows what was fetched. [Tasks 7 and 8]
2. A hostile playlist (HTML or script in names and groups, very long lines, control characters, an SVG or oversized "logo") is stored cleanly, truncated where needed, shown as text, and never served as an image. [Tasks 3, 4, 8, 15, 16]
3. Re-importing the same file changes nothing: ids stay the same, `removed` and edited streams are not revived or overwritten, nothing is duplicated, and a clash of the 12-character public id stops the import loudly. [Task 5]
4. The snapshot is never half-written and never lists an unlisted state; the endpoint answers 304 to a matching `If-None-Match` and 503 before the first import. [Tasks 6 and 9]
5. With the server down, answering 503, or sending an empty or corrupt snapshot, the HLS page shows the demo list and plays the default demo instead of a blank page. [Task 20]

---

## Stage A: the server side

### Task 1: Config keys and migration 003

**Files:** Modify `server/src/Config.php`, `server/config.example.php`; Create `server/migrations/003_streams.sql`; Test `server/tests/ConfigTest.php`, `server/tests/SchemaTest.php`, `server/tests/AdminScriptsTest.php` (installer output).

**Interfaces:** Produces `Config::playlistDataDir(): string` (key `playlist.data_dir`, default `dirname(__DIR__) . '/data'`, i.e. `/prism-data/data`) and `Config::playlistLogoDir(): string` (key `playlist.logo_dir`, default `dirname(__DIR__) . '/public/logos'`); a non-string or empty value means the default; neither is read by `check()` or throws. The `streams` table above.

- [ ] **Step 1: Failing tests.** `ConfigTest::testPlaylistDirsDefaultAndNeverThrow` (defaults end in `/data` and `/public/logos`; a configured string is used; an array or `''` falls back). `SchemaTest::testStreamsTableExists`, `testStreamPublicIdIsUnique` (a second row with the same `public_id` throws), `testStreamStateRejectsUnknownValues`, `testThirdMigrationCanBeRunAgain`. Change `AdminScriptsTest::testInstallAppliesMigrationsAndIsIdempotent` to expect `applied 003_streams` after `applied 002_admin`.
- [ ] **Step 2: Run** `--filter 'ConfigTest|SchemaTest|AdminScriptsTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** the two methods, a commented `playlist` block in `config.example.php`, and `003_streams.sql` (`CREATE TABLE IF NOT EXISTS`, indexes on `state` and `pinned`, the same engine and collation as the earlier migrations).
- [ ] **Step 4: Run** the same filter then the full server suite: PASS. Commit `feat: streams table and playlist folders`.

### Task 2: Address normalising, ids and country codes

**Files:** Create `server/src/Playlist/StreamUrl.php`, `server/src/Playlist/Countries.php`; Test `server/tests/StreamUrlTest.php`.

**Interfaces:** Produces `StreamUrl::normalise(string $url): ?string` (null unless an `http`/`https` address with a host and **no** userinfo; lower-cases the scheme and host, drops the default port (80 for http, 443 for https) and the fragment, keeps the path's case and the query as written, trims whitespace); `StreamUrl::id(string $normalised): string` (SHA-256 hex, 64 characters); `StreamUrl::publicId(string $id): string` (the first 12 characters); `Countries::flagCode(?string $suffix): ?string` (lower-case two letters; `uk` becomes `gb`; anything else null).

- [ ] **Step 1: Failing tests** in `StreamUrlTest`: `testNormaliseTable` (rows for an upper-case host, `:80`/`:443` dropped, `:8080` kept, fragment dropped, query kept, path case kept, whitespace trimmed; `ftp://`, `javascript:`, no host and `user:pass@host` all null); `testTheSameStreamWrittenTwoWaysHasTheSameId`; `testIdIs64HexAndPublicIdItsFirst12`; `testFlagCodes` (`us`, `UK` and `uk` to `gb`, `xyz`, `''`, null).
- [ ] **Step 2: Run** `--filter StreamUrlTest`. Expected: FAIL.
- [ ] **Step 3: Implement** both classes (`parse_url` plus rebuild; no regex over the whole address).
- [ ] **Step 4: Run**: PASS. Commit `feat: stable stream ids from normalised addresses`.

### Task 3: The M3U parser

**Files:** Create `server/src/Playlist/M3uEntry.php`, `server/src/Playlist/M3uParser.php`; Test `server/tests/M3uParserTest.php`.

**Interfaces:** Produces `M3uEntry(string $tvgId, string $logo, string $group, string $name, string $url, bool $hasPlayerOptions)` (public readonly) and `M3uParser::parse(string $text): list<M3uEntry>`. An entry is an `#EXTINF` line, any `#EXT...` option lines (`#EXTVLCOPT` sets `hasPlayerOptions`), then the address line. The name is the text after the last comma outside quotes; the attributes are `tvg-id`, `tvg-logo` and `group-title`. Handles CRLF, a BOM and blank lines; an `#EXTINF` with no address and an address with no `#EXTINF` are dropped; names are cut to 200 characters and control characters are removed from names, groups and ids.

- [ ] **Step 1: Failing tests:** `testParsesTheRealFileShape` (three entries copied from `HLS_valid.m3u`: one with `@SD`, one with `;` in the group, one plain); `testPlayerOptionsAreFlagged`; `testCommasInsideQuotesDoNotSplitTheName`; `testCrlfAndBomAndBlankLines`; `testOrphansAreDropped`; `testHostileTextIsKeptAsDataNotInterpreted` (`<script>`, a 5,000-character name, a NUL and a newline escape inside an attribute); `testLongNamesAreTruncatedTo200`.
- [ ] **Step 2: Run** `--filter M3uParserTest`. Expected: FAIL.
- [ ] **Step 3: Implement** as a single pass over the lines.
- [ ] **Step 4: Run**: PASS. Commit `feat: M3U parser for the playlist import`.

### Task 4: Import rules

**Files:** Create `server/src/Playlist/ImportDecision.php`, `server/src/Playlist/ImportRules.php`; Test `server/tests/ImportRulesTest.php`.

**Interfaces:** Consumes `M3uEntry`, `StreamUrl`, `Countries`. Produces `ImportRules::judge(M3uEntry $e): ImportDecision`; `ImportDecision(string $verdict, ?string $state, ?string $reason, ?string $normalisedUrl, string $kind, ?string $country, list<string> $groups)` with `verdict` `accept` or `reject`. Reject reasons (the first match wins, in this order): `player_options`, `credentials` (userinfo in the address), `bad_address` (not http/https or no host), `token` (a query parameter named, case-insensitively, `token tok key apikey api_key auth authorization password pass pwd secret sig signature hdnts hdnea wmsauthsign expires exp`), `adult` (any group part matching `xxx adult porn erotic sex hentai 18+` as a whole word). Accepted entries: `kind` is `dash` when the path contains `.mpd`, else `hls`; `country` is `Countries::flagCode` of the id's suffix after the last `.` and before an `@`; `groups` are the group split on `;`, trimmed, empty parts dropped, `Undefined` or empty becoming `Other`; the state is `new`, or `unplayable` with reason `http` for `http://`, or `held` with reason `port` when the port is not 80 or 443.

- [ ] **Step 1: Failing tests:** `testEachRejectReasonAndTheirOrder`, `testHttpIsUnplayableNotRejected`, `testOddPortIsHeldNotRejected`, `testHttpsOn443AndHttpOn80AreNormalPorts`, `testGroupsSplitTrimAndUndefinedBecomesOther`, `testKindAndCountryFromTheEntry` (`.mpd`, `uk` to `gb`, no suffix gives null, `ChannelName.us@SD` gives `us`), `testAdultWordsOnlyMatchWholeWords` (a group called "Essex" is accepted).
- [ ] **Step 2: Run** `--filter ImportRulesTest`. Expected: FAIL.
- [ ] **Step 3: Implement** `judge` as a short sequence of guard clauses.
- [ ] **Step 4: Run**: PASS. Commit `feat: import rules for the playlist`.

### Task 5: The stream store and the importer

**Files:** Create `server/src/Store/StreamStore.php`, `server/src/Playlist/DemoStreams.php`, `server/src/Playlist/Importer.php`; Test `server/tests/StreamStoreTest.php`, `server/tests/ImporterTest.php`.

**Interfaces:** Produces `StreamStore::__construct(PDO, Clock)`; `insertIfNew(array $row): bool` (the row keys are the column names; false when `id` already exists; throws `RuntimeException('public id clash')` when only `public_id` clashes); `findByPublicId(string): ?array`; `listed(): list<array>` (states `new`, `working`, `suspect`; pinned first, then name ignoring case); `countsByState(): array<string,int>`; `setDefault(string $publicId): bool` (exactly one default, in a transaction); `withLogoToFetch(int $limit): list<array>` (`logo_url` set, `logo_file` null, `logo_tries < 3`); `recordLogo(string $id, ?string $file): void` (a file name, or null to add one try). `DemoStreams::ALL` (the five demo entries from `src/config/demoContent.ts`: Apple HLS Basic, Apple 4K HEVC, Big Buck Bunny, Big Buck Bunny DASH, Envivio DASH, with their addresses, group `Demo`, kind, and `bbb-hls` as the default). `Importer::__construct(StreamStore, Clock)`; `import(string $m3uText, string $batch, bool $write): array<string,int>` with keys `entries inserted already_known duplicates rejected_player_options rejected_credentials rejected_bad_address rejected_token rejected_adult unplayable_http held_port`; `seedDemos(bool $write): int` (inserts the demo entries pinned, state `working`, source `demo`, and marks the default).

- [ ] **Step 1: Failing tests:** `StreamStoreTest` (`testInsertIfNewIsIdempotent`, `testPublicIdClashThrows`, `testListedExcludesUnlistedStatesAndOrdersPinnedFirst`, `testSetDefaultKeepsExactlyOne`, `testLogoQueueSkipsDoneAndExhaustedRows`). `ImporterTest` (`testCountsMatchAHandBuiltFile`, `testReimportChangesNothing`, `testARemovedStreamIsNeverRevived` (set a row to `removed`, re-import, it is still `removed` and its name is untouched), `testAnEditedNameSurvivesReimport`, `testDuplicateAddressesInOneFileAreCountedOnce`, `testDryRunWritesNothing`, `testHostileNamesAreStoredAsText`, `testSeedDemosPinsFiveAndDefaultsToBigBuckBunny`).
- [ ] **Step 2: Run** `--filter 'StreamStoreTest|ImporterTest'`. Expected: FAIL.
- [ ] **Step 3: Implement.** The importer builds each row from `ImportRules::judge` and `StreamUrl`, with `source` the batch name and `added_at` from the clock.
- [ ] **Step 4: Run**: PASS. Commit `feat: stream store and the insert-only importer`.

### Task 6: The visitor snapshot writer

**Files:** Create `server/src/Playlist/SnapshotWriter.php`; Test `server/tests/SnapshotWriterTest.php`.

**Interfaces:** Consumes `StreamStore::listed()`. Produces `SnapshotWriter::__construct(StreamStore, Clock, string $dataDir)`; `write(): array{streams:int,bytes:int,gzipped:int}` writing `streams.json` and `streams.json.gz` in the contract's shape: `groups` sorted by how many listed streams use them (descending, ties by name), `default` the default stream's public id or null, each file written to a temporary name and renamed so a reader never sees half a file; the data folder is created (mode 0750) if missing. `path(): string`.

- [ ] **Step 1: Failing tests:** `testShapeMatchesTheContract`, `testOnlyListedStatesAreIncluded` (a `held`, `unplayable`, `dead` and `removed` row are absent), `testPinnedFirstThenNameIgnoringCase`, `testGroupIndexesPointAtTheRightNames`, `testNoTemporaryFileIsLeftBehind`, `testTheGzipFileInflatesToTheSameJson`, `testAnEmptyStoreWritesAnEmptyValidSnapshot`, `testNamesWithQuotesAndUnicodeSurviveEncoding`.
- [ ] **Step 2: Run** `--filter SnapshotWriterTest`. Expected: FAIL.
- [ ] **Step 3: Implement** (`json_encode` with `JSON_THROW_ON_ERROR`, `gzencode`, `rename`).
- [ ] **Step 4: Run**: PASS. Commit `feat: visitor snapshot of the listed streams`.

### Task 7: The guarded fetcher

**Files:** Create `server/src/Net/IpGuard.php`, `Resolver.php`, `SystemResolver.php`, `PinnedTransport.php`, `PinnedResponse.php`, `CurlPinnedTransport.php`, `SafeFetchResult.php`, `SafeFetcher.php`; Test `server/tests/IpGuardTest.php`, `server/tests/SafeFetcherTest.php`; test support `server/tests/Support/FakeResolver.php`, `FakeTransport.php`.

**Interfaces:** Produces `IpGuard::isPublic(string $ip): bool`. `Resolver::ips(string $host): list<string>`. `PinnedTransport::get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec): PinnedResponse` (`status`, lower-case `headers`, `body` cut at `$maxBytes`, `truncated`); `CurlPinnedTransport` sends the request to the vetted ip with `CURLOPT_RESOLVE`, never follows redirects itself and stops reading at `$maxBytes`. `SafeFetcher::__construct(Resolver, PinnedTransport, string $userAgent, int $maxRedirects = 3)`; `fetch(string $url, int $maxBytes, int $timeoutSec = 8): SafeFetchResult` (`status`, `headers`, `body`, `finalUrl`, `error` one of `null blocked port scheme dns redirects too_large network`). Rules: scheme http/https only; port 80 or 443 only; every address the name resolves to must pass `IpGuard` (one bad answer blocks the name); the request goes to the first vetted address; each redirect `Location` is resolved against the current URL and goes through all of the above again.

- [ ] **Step 1: Failing tests.** `IpGuardTest::testAddressTable` (public: `8.8.8.8`, `2001:4860:4860::8888`; blocked: `127.0.0.1`, `10.0.0.1`, `172.16.5.5`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, `::1`, `fe80::1`, `fc00::1`, `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `64:ff9b::7f00:1`, and garbage text). `SafeFetcherTest`: `testFetchesAPublicAddressThroughThePinnedIp`, `testAnyPrivateAnswerBlocksTheName` (mixed answers), `testRedirectToAPrivateAddressIsBlocked`, `testRedirectToAnotherPortIsBlocked`, `testMoreThanThreeRedirectsStops`, `testNonHttpSchemesAndUserinfoAreRefused`, `testPortsOtherThan80And443AreRefused`, `testBodyIsCutAtTheLimitAndReportedTooLarge`, `testAResolverFailureIsDnsNotAnException`, `testTheErrorNeverContainsTheBody`, `testLiteralIpAddressesAreVettedToo`.
- [ ] **Step 2: Run** `--filter 'IpGuardTest|SafeFetcherTest'`. Expected: FAIL.
- [ ] **Step 3: Implement.** `IpGuard` uses `filter_var` with `FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE` plus explicit CGNAT, ULA, link-local and IPv4-mapped/NAT64 checks by unpacking the address; the real `SystemResolver` uses `dns_get_record` (A and AAAA).
- [ ] **Step 4: Run** the filter then the full suite: PASS. Commit `feat: guarded fetcher for outside addresses`.

### Task 8: The logo fetcher

**Files:** Create `server/src/Playlist/LogoFetcher.php`; Test `server/tests/LogoFetcherTest.php`.

**Interfaces:** Consumes `SafeFetcher`, `StreamStore::withLogoToFetch/recordLogo`, `SnapshotWriter`, `Tracker\Sleeper`, `Clock`. Produces `LogoFetcher::__construct(SafeFetcher, StreamStore, SnapshotWriter, Sleeper, Clock, string $logoDir)`; `run(int $limit): array{fetched:int,failed:int}`; `static sniff(string $bytes): ?string` returning `png`, `jpg`, `gif` or `webp` from the first bytes (`\x89PNG`, `\xFF\xD8\xFF`, `GIF87a`/`GIF89a`, `RIFF....WEBP`), else null. A logo is accepted only when it sniffs as one of those and is at most 262,144 bytes; it is written to `<logoDir>/<public_id>.<ext>` through a temporary name and `rename`, then `logo_file` is recorded; a failure adds one try. Requests to the same host are at least 1 second apart (sleep through the injected `Sleeper`). The snapshot is rewritten once at the end of a run that changed anything.

- [ ] **Step 1: Failing tests:** `testSniffTable` (the four formats, an SVG, HTML, an empty string, a truncated PNG header), `testAnSvgNamedPngIsRejected`, `testAHtmlErrorPageWithAnImageContentTypeIsRejected`, `testOversizeLogosAreRejected`, `testAcceptedLogoIsWrittenAndRecordedWithTheRightExtension`, `testAFailureAddsOneTryAndStopsAfterThree`, `testSameHostRequestsAreOneSecondApart`, `testPrivateLogoHostsAreNeverFetched` (the `FakeResolver` answers `10.0.0.5`), `testTheSnapshotIsRewrittenOnlyWhenSomethingChanged`, `testRunHonoursTheLimit`.
- [ ] **Step 2: Run** `--filter LogoFetcherTest`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**: PASS. Commit `feat: logo fetcher with its own copies`.

### Task 9: `GET /api/streams`

**Files:** Create `server/src/Api/StreamsController.php`; Modify `server/src/Api/Request.php`, `server/src/Api/Router.php`, `server/src/Container.php`; Test `server/tests/StreamsApiTest.php`, `server/tests/RequestTest.php`.

**Interfaces:** `Request` gains optional `?string $ifNoneMatch = null, ?string $acceptEncoding = null` after `$authorization` (filled from `HTTP_IF_NONE_MATCH` and `HTTP_ACCEPT_ENCODING`). `StreamsController::__construct(string $dataDir)`; `handle(Request): ApiResponse`. The route `GET /api/streams` goes through the router's origin check and CORS like the other public routes. Answer: 200 with the snapshot, an `ETag` (a quoted hash of the file), `Cache-Control: public, max-age=300`, `Vary: Origin, Accept-Encoding`; the `.gz` file with `Content-Encoding: gzip` when `acceptEncoding` contains `gzip`; 304 with no body when `If-None-Match` matches; 503 `{"error":"not_ready"}` when the file is missing or unreadable; 405 with `Allow: GET, OPTIONS` otherwise.

- [ ] **Step 1: Failing tests:** `testServesTheSnapshotWithEtagAndCache`, `testAMatchingIfNoneMatchIs304WithNoBody`, `testGzipWhenAcceptedAndPlainWhenNot`, `testBeforeTheFirstImportIs503NotReady`, `testAnUnreadableFileIs503`, `testWrongMethodIs405`, `testADisallowedOriginIs403`, `testCorsHeadersForAnAllowedOrigin`; `RequestTest::testFromGlobalsReadsIfNoneMatchAndAcceptEncoding`.
- [ ] **Step 2: Run** `--filter 'StreamsApiTest|RequestTest|RouterTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire the controller in `Container::router()` with `$config->playlistDataDir()`.
- [ ] **Step 4: Run** the filter then the full suite: PASS. Commit `feat: GET /api/streams serves the visitor snapshot`.

### Task 10: The command-line scripts

**Files:** Create `server/bin/import-playlist.php`, `server/bin/fetch-logos.php`; Modify `server/src/Container.php`; Test `server/tests/AdminScriptsTest.php`.

**Interfaces:** `Container::importer(Config $config, PDO $pdo, ?Clock $clock = null): Importer`, `Container::snapshotWriter(Config $config, PDO $pdo, ?Clock $clock = null): SnapshotWriter`, `Container::logoFetcher(Config $config, PDO $pdo, ?Resolver $resolver = null, ?PinnedTransport $transport = null, ?Sleeper $sleeper = null, ?Clock $clock = null): LogoFetcher`. `php bin/import-playlist.php <path-to-m3u> [--dry-run] [--batch=<name>]` prints one `key=value` line per count from `Importer::import`, plus `demos=<n>`, and, unless `--dry-run`, writes the snapshot and prints `snapshot streams=<n>`; it exits 2 with a usage line for a missing or unreadable file and 1 on failure (class name only). `php bin/fetch-logos.php [--limit=<n>]` (default 100, at most 1,000) prints `fetched=<n> failed=<n>`. Both are command line only (404 over the web, like the other scripts) and read the config through `PRISM_HISTORY_CONFIG` or `/prism-data/config.php`.

- [ ] **Step 1: Failing tests:** `testImportScriptDryRunPrintsCountsAndWritesNothing` (against a temporary config and a small fixture M3U), `testImportScriptWritesTheStreamsAndTheSnapshot`, `testImportScriptNeedsAReadableFile` (exit 2), `testFetchLogosScriptNeedsNoNetworkWhenThereIsNothingToFetch` (prints `fetched=0 failed=0`), `testBothScriptsRefuseToRunOverTheWeb`.
- [ ] **Step 2: Run** `--filter AdminScriptsTest`. Expected: FAIL.
- [ ] **Step 3: Implement** both scripts as thin wrappers over the container factories.
- [ ] **Step 4: Run** the filter then the full suite: PASS. Commit `feat: import-playlist and fetch-logos commands`.

### Task 11: Deploy, import and fetch logos (owner OK; owner-run steps marked)

**Files:** Modify `server/README.md` (the playlist section: data folder, the two commands, the logo folder, the state names, how to re-import).

- [ ] **Step 1: Docs.** Describe the store, the contract, the two commands and the safety rules in the README; commit `docs: playlist store and import notes`.
- [ ] **Step 2: Deploy (ask the owner first).** Deploy, then run the installer over SSH (expect `applied 003_streams`). The one-off SSH runner used for piece 1 is gone with its session; write a new one in the scratchpad (reuse `passwordFrom` and `hostKeyMatches` from `server/tools/lib/historyDeploy.mjs`, the password from the environment, an allow-list of exactly the commands needed, `MSYS_NO_PATHCONV=1` when passing a path starting with `/usr`).
- [ ] **Step 3: Upload the list.** SFTP-upload `C:/Dev/projects/wsp-skills-portfolio/wsp-sender/public/data/HLS_valid.m3u` (read-only source, copied, never edited) to `prism-data/data/import/HLS_valid.m3u`.
- [ ] **Step 4: Import.** Run `import-playlist.php prism-data/data/import/HLS_valid.m3u --dry-run`, compare the counts with the source facts above (5,234 entries; 57 with player options; 14 with token-like parameters; about 1,176 `http`; about 772 odd ports; 3 duplicates), then run it without `--dry-run`. Confirm `GET /api/streams` answers 200 with about 3,000 streams and a default.
- [ ] **Step 5: Logos.** Run `fetch-logos.php --limit=200` and check the result and one logo address in a browser. The owner decides whether a cron entry (every 5 minutes, `--limit=250`) finishes the job (about 3,600 logos come from one host at 1 request a second); otherwise repeat the command until `fetched=0`. Record the outcome.

---

## Stage B: the HLS page

### Task 12: The snapshot client

**Files:** Create `src/lib/streamsApi.ts`; Test `src/lib/__tests__/streamsApi.test.ts`.

**Interfaces:** Consumes `HISTORY_ENABLED`, `HISTORY_API_URL`. Produces `interface StreamEntry { id: string; name: string; groups: number[]; country: string | null; logo: string | null; kind: 'hls' | 'dash'; pinned: boolean; state: 'new' | 'working' | 'suspect'; url: string }`, `interface StreamSnapshot { generated: string; defaultId: string | null; groups: string[]; streams: StreamEntry[] }`, `type SnapshotResult = { kind: 'ready'; snapshot: StreamSnapshot } | { kind: 'unavailable' }`, `parseSnapshot(json: unknown): StreamSnapshot | null` (null for any wrong shape: a non-`http(s)` address, a group index out of range, a non-string name, `v` not 1), `loadStreamSnapshot(signal?: AbortSignal): Promise<SnapshotResult>` (one `GET /api/streams` with `credentials: 'omit'`, a 10 second timeout, never throws; a good result is remembered for the page session, a failure is not), `logoUrl(file: string): string | null` (`${HISTORY_API_URL}/logos/${file}` only for names matching `/^[0-9a-f]{12}\.(png|jpg|gif|webp)$/`, else null), `resetSnapshotCache(): void` for tests.

- [ ] **Step 1: Failing tests** (mock `../../config/historyServer` as `historyApi.test.ts` does; stub `fetch`): `testMapsTheContractToCamelCase`, `testUnknownFieldsAreIgnored`, `testEachWrongShapeIsRejected` (a table of bad snapshots), `testKillSwitchAndErrorsAreUnavailableWithNoThrow` (503, a network error, a timeout, bad JSON; an empty `streams` list is still ready), `testGoodResultIsCachedAndFailureIsNot`, `testLogoUrlOnlyForExpectedNames`.
- [ ] **Step 2: Run** `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/streamsApi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with small `rec/list/str/num` guards like `adminApi.ts`.
- [ ] **Step 4: Run** the file and the type check: PASS. Commit `feat: client for the visitor stream list`.

### Task 13: Filtering helpers and country names

**Files:** Create `src/lib/streamFilter.ts`, `src/lib/countries.ts`; Test `src/lib/__tests__/streamFilter.test.ts`, `src/lib/__tests__/countries.test.ts`.

**Interfaces:** `filterStreams(streams: StreamEntry[], query: { text: string; group: number | null }): StreamEntry[]` (the text matches the name ignoring case and accents, every word must match; a group keeps the streams whose `groups` contains it; the order is kept); `groupCounts(streams: StreamEntry[], groupCount: number): number[]`; `regionName(code: string | null): string` (`Intl.DisplayNames(['en'], { type: 'region' })`, the upper-case code on failure, `''` for null).

- [ ] **Step 1: Failing tests:** `testEmptyQueryKeepsEverythingInOrder`, `testWordsAreAllRequiredIgnoringCaseAndAccents` ("telé" finds "Tele"), `testGroupFilterAndCombinedFilter`, `testGroupCounts`, `testRegionNameForKnownUnknownAndNullCodes`.
- [ ] **Step 2: Run** both files. Expected: FAIL. **Step 3: Implement.** **Step 4: Run**: PASS. Commit `feat: stream list filtering and country names`.

### Task 14: Flags and the windowed list

**Files:** Modify `package.json` and the lockfile (`pnpm add flag-icons`); Create `src/components/streams/CountryFlag.tsx`, `src/lib/windowRange.ts`, `src/hooks/useWindowedGrid.ts`, `src/components/streams/StreamGrid.tsx`; Test `src/components/streams/__tests__/CountryFlag.test.tsx`, `src/lib/__tests__/windowRange.test.ts`, `src/components/streams/__tests__/StreamGrid.test.tsx`.

**Interfaces:** `CountryFlag({ code: string | null; size?: number })` renders an `<img>` from the bundled `flag-icons` 4x3 SVGs (`import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { eager: true, query: '?url', import: 'default' })`) with an empty `alt`, and nothing for null or an unknown code. `windowRange(input: { scrollTop: number; viewportHeight: number; rowHeight: number; rowCount: number; overscan: number }): { firstRow: number; endRow: number }`. `useWindowedGrid({ itemCount, rowHeight, minCardWidth })` returns `{ containerRef, columns, totalHeight, firstIndex, endIndex, offsetY }` from the container's scroll position and width (a `ResizeObserver`). `StreamGrid({ streams, selectedId, onSelect, renderCard })` is a scrolling box (max height 70vh) that mounts only the visible rows.

- [ ] **Step 1: Failing tests:** `windowRange.test.ts` (top, middle, end, fewer rows than the viewport, zero rows, overscan clamped); `CountryFlag.test.tsx` (`us` renders an image, `zz` and null render nothing, `gb` exists); `StreamGrid.test.tsx` (5,000 items mount far fewer than 100 cards, scrolling moves the window, the selected card is marked `aria-current`, an empty list shows "No streams match.").
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.** Check that the `flag-icons` licence file says MIT before committing.
- [ ] **Step 4: Run** the files and the type check: PASS. Commit `feat: country flags and a windowed stream grid`.

### Task 15: The stream card

**Files:** Create `src/components/streams/StreamCard.tsx`; Test `src/components/streams/__tests__/StreamCard.test.tsx`.

**Interfaces:** `StreamCard({ stream: StreamEntry; selected: boolean; onSelect: (id: string) => void })`: a button with the logo (`<img loading="lazy" referrerPolicy="no-referrer" alt="">` from `logoUrl`, or a letter tile with the first letter of the name on a colour taken from the id when there is no logo or it fails to load), the name, the flag, a "pinned" mark for pinned streams and an "unchecked" badge when `state === 'new'`.

- [ ] **Step 1: Failing tests:** `testShowsNameFlagAndUncheckedBadge`, `testNoBadgeForWorkingStreams`, `testLetterTileWhenThereIsNoLogoAndWhenTheImageFails`, `testMarkupInANameIsShownAsText` (no element is created), `testClickSelects`, `testSelectedIsMarked`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run**: PASS. Commit `feat: stream card`.

### Task 16: The About panel

**Files:** Create `src/hooks/useAutoFold.ts`, `src/components/streams/AboutPanel.tsx`; Test `src/hooks/__tests__/useAutoFold.test.ts`, `src/components/streams/__tests__/AboutPanel.test.tsx`.

**Interfaces:** `useAutoFold(resetKey: string, ms = 30_000): { open: boolean; pinned: boolean; bump(): void; reopen(): void; togglePin(): void }` (opens and restarts when `resetKey` changes, folds after `ms`, `bump` restarts the timer, a pinned panel never folds, no timer runs while the document is hidden). `AboutPanel({ stream: StreamEntry | null; groups: string[] })` shows the large channel picture or letter tile, the name (large text, about 1.4 times the body size), the flag image and country name, the groups, the stream kind, the **host** of the address only, and "Not checked yet" for `new` streams; a slim tab reopens it; hover and click restart the timer; a pin keeps it open; it never takes keyboard focus; with `prefers-reduced-motion` it folds without animation.

- [ ] **Step 1: Failing tests:** hook: `testOpensAndFoldsAfterThirtySeconds`, `testBumpRestartsTheTimer`, `testNewKeyReopens`, `testPinKeepsItOpen`, `testReopenAfterFold`; panel: `testShowsHostNeverTheFullAddress` (an address with a token in the query shows only the host), `testMarkupInANameIsText`, `testNoStreamShowsAPrompt`, `testTabReopensAFoldedPanel`, `testFocusIsNotStolen` (the active element is unchanged when the panel opens).
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** (fake timers in tests). **Step 4: Run**: PASS. Commit `feat: About this stream panel`.

### Task 17: Extract the stream player panel

**Files:** Create `src/components/player/StreamPlayerPanel.tsx`; Modify `src/pages/HlsDashPlayerPage.tsx`; Test `src/pages/__tests__/HlsDashPlayerPage.test.tsx` (must pass unchanged).

**Interfaces:** `StreamPlayerPanel({ source: StreamSource; heading?: boolean })` is today's `StreamPlayer` (retry, try-as, the stall notice, the error card, the debug panel) moved out of the page with no change in behaviour; `heading` (default true) keeps the current title row, and the new page passes false. `HlsDashPlayerPage` imports it.

- [ ] **Step 1:** Run `node ./node_modules/vitest/vitest.mjs run src/pages/__tests__/HlsDashPlayerPage.test.tsx` and note that it passes. **Step 2:** Move the component and its helpers (`ReportOnMount`) into the new file and import it from the page. **Step 3:** Run the same test file and `src/components/player`: PASS, unchanged. **Step 4:** Type check, commit `refactor: stream player panel as its own component`.

### Task 18: Resolve a stream from the snapshot

**Files:** Modify `src/lib/streamSource.ts`, `src/config/demoContent.ts` (add `demoToEntry`); Test `src/lib/__tests__/streamSource.test.ts`.

**Interfaces:** `resolveSnapshotStream(streamId: string | undefined, snapshot: StreamSnapshot | null): StreamSource | null` (a public id in the snapshot becomes a source for its address, the kind taken from the entry, `guessedKind` false; unknown ids, a null snapshot and an address that fails `isHttpAddress` give null); `demoToEntry(demo: DemoEntry): StreamEntry` (the fallback list when the server is down: pinned, state `working`, group `Demo`, no logo). `resolveStreamSource` is unchanged.

- [ ] **Step 1: Failing tests:** `testKnownPublicIdResolves`, `testUnknownIdAndNullSnapshotGiveNull`, `testDashKindIsKept`, `testAnEntryWithABadAddressIsRefused`, `testDemoToEntryShape`, and the existing `resolveStreamSource` cases still pass.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the file and the type check: PASS. Commit `feat: resolve snapshot streams for the player page`.

### Task 19: The snapshot hook

**Files:** Create `src/hooks/useStreamSnapshot.ts`; Test `src/hooks/__tests__/useStreamSnapshot.test.tsx`.

**Interfaces:** `useStreamSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; snapshot: StreamSnapshot | null }` loads once per page session through `loadStreamSnapshot` and aborts on unmount.

- [ ] **Step 1: Failing tests:** `testLoadsOnceAcrossTwoMounts`, `testUnavailableWhenTheClientSaysSo`, `testAbortsOnUnmount`. **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run**: PASS. Commit `feat: hook for the visitor stream list`.

### Task 20: The HLS page and its routes

**Files:** Create `src/pages/HlsPage.tsx`, `src/components/streams/GroupPills.tsx`, `src/components/streams/StreamSearch.tsx`; Modify `src/AppRoutes.tsx`, `src/App.tsx` (treat `/hls-dash` like a player page for the rain and the rail gutter), `src/pages/ProtocolPage.tsx` (the HLS branch is retired; the `?url=` redirect behaviour moves to `HlsPage`), `src/__tests__/AppRoutes.test.tsx`; Test `src/pages/__tests__/HlsPage.test.tsx`; adapt `src/pages/__tests__/ProtocolPage.hls.test.tsx` and `HlsDashPlayerPage.test.tsx` to the new routes without dropping any case.

**Interfaces:** Routes `hls-dash` and `hls-dash/:streamId` both render `HlsPage`. The page decides what to play in this order: `/hls-dash/custom?url=` or a demo id through the existing `resolveStreamSource`; a snapshot id through `resolveSnapshotStream`; no id: the snapshot's default, else the demo `bbb-hls`; an unknown id shows `StreamNotFound` with the list still visible. `/hls-dash?url=<address>` still redirects to `buildStreamPath(address)` as `ProtocolPage` does today. Layout: the player (`StreamPlayerPanel` without its heading) on the left, `AboutPanel` on the right (stacked on a narrow window), then `StreamSearch`, `GroupPills` (with counts) and `StreamGrid` of `StreamCard`s. Choosing a card navigates to `/hls-dash/<id>` (a normal history entry) and the panel reopens. The list is the snapshot's streams; when the snapshot is `unavailable`, empty or corrupt, the list is `getHlsDashDemo().map(demoToEntry)`, a small notice says "Showing the built-in demo streams", and the default is `bbb-hls`. A footer line credits the iptv-org project as the source of the list. While the snapshot loads, the player area already plays the default demo.

- [ ] **Step 1: Failing tests** (mock `useStreamSnapshot`, `PlayerHost` and `StreamPlayerPanel` as markers where useful): `testPlaysTheSnapshotDefaultWhenNoIdIsGiven`, `testPlaysTheStreamNamedInTheAddress`, `testChoosingACardChangesTheAddress`, `testSearchAndGroupFilterTheList`, `testUnknownIdShowsNotFoundWithTheList`, `testCustomAddressStillPlaysAndShowsTheList`, `testPastedListingLinkRedirectsToTheCustomPath`, `testServerDownShowsTheDemoListAndPlaysTheDemoDefault`, `testEmptyAndCorruptSnapshotsFallBackToTheDemos`, `testCreditLineNamesIptvOrg`, `testDemoLinksStillWork` (`/hls-dash/apple-basic`); `AppRoutes.test.tsx` cases for both routes inside the layout.
- [ ] **Step 2: Run** the page, route and adapted tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Read `ProtocolPage.tsx` (lines 160 to 239) and `ProtocolPage.hls.test.tsx` first and keep every behaviour they pin.
- [ ] **Step 4: Run** the changed tests, then the whole front-end suite, the type check and lint: PASS. Commit `feat: the new HLS page with a playlist`.

### Task 21: Preview in a browser

**Files:** none (verification).

- [ ] **Step 1:** Start the `prism-dev` preview (copy the owner's git-ignored `.env` into the worktree with `cp`, never reading it, and delete the copy afterwards). Open `/hls-dash` against the live server: the default plays, the About panel opens and folds after 30 seconds, the list scrolls smoothly with logos and flags, search and group pills filter, choosing a card changes the address, `/hls-dash/apple-basic` and a pasted address still work, and with `VITE_HISTORY_API_URL=http://localhost:1` the demo list and the notice show.
- [ ] **Step 2:** Record what was seen (and any defect, fixed test-first) in the PR notes.

### Task 22: Docs and live acceptance (owner-run)

**Files:** Modify `CLAUDE.md` (Key Files: `src/pages/HlsPage.tsx`, `src/lib/streamsApi.ts`, the server's playlist store), `docs/superpowers/specs/2026-11-13-playlist-admin-design.md` (a short "Piece 2 as built" note: the address in the snapshot, the 12-character public id, the insert-only import).

- [ ] **Step 1:** Everything green: the full server suite, the full front-end suite, `tsc -b`, `eslint src`, `vite build`.
- [ ] **Step 2 (owner):** open the HLS page on `http://localhost:5000/hls-dash` against the live server and try a dozen streams (some will be dead until the checker exists: that is expected); check a pinned demo, a stream with a logo and one without, a DASH demo, search, a group, the address-bar link opened in a fresh tab, and the demo fallback with the offline switch from Task 21.
- [ ] **Step 3:** Update the notes, commit `docs: piece 2 notes`, and open the PR when the owner asks (stacked; the owner decides when to merge).

---

## Stage C: the Playlist admin screen (optional)

### Task 23: Admin stream list and writes (server)

**Files:** Modify `server/src/Store/StreamStore.php`, `server/src/Admin/AdminController.php`, `server/src/Admin/AdminReports.php`, `server/src/Container.php`; Create `server/src/Admin/PlaylistAdmin.php`; Test `server/tests/AdminPlaylistTest.php`.

**Interfaces:** `StreamStore::search(array $filters, int $limit, int $offset): array{rows:list<array>,total:int}` (filters `text`, `state`, `group`, `country`). `PlaylistAdmin::__construct(PDO, StreamStore, AuditStore, SnapshotWriter, Clock)` with `add(string $url, string $name, string $group): array` (the same rules as the import; a rejected address returns the reason, a known id returns `already_known`), `update(string $publicId, string $name, array $groups)`, `setPinned(string $publicId, bool $pinned)`, `setDefault(string $publicId)`, `remove(string $publicId)` (state `removed`, kept as a tombstone, its logo file deleted); each in one transaction with its audit row (`stream.add`, `stream.update`, `stream.pin`, `stream.default`, `stream.remove`) and a snapshot rewrite after the commit. Routes (owner only, like the rest): `GET /api/admin/streams?text=&state=&group=&country=&limit=&offset=` and `POST /api/admin/streams/add|update|pin|default|remove` with JSON bodies that use `public_id` where an existing stream is meant.

- [ ] **Step 1: Failing tests:** `testListFiltersAndPaginates`, `testAddAppliesTheImportRules` (credentials, token, adult, and `http` marked unplayable), `testAddKnownAddressIsAlreadyKnown`, `testUpdatePinDefaultAndRemoveEachWriteOneAuditRowAndRewriteTheSnapshot`, `testRemovedStreamsAreTombstonesAndLeaveTheList`, `testRemovingTwiceOrUnknownIsNotFound`, `testAFailingAuditLeavesTheStreamUnchanged`, `testANonOwnerCannotChangeAnything`, `testBadBodiesAre400`.
- [ ] **Step 2: Run** `--filter AdminPlaylistTest`. Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the filter then the full suite: PASS. Commit `feat: playlist admin API`.

### Task 24: The Playlist screen (front end)

**Files:** Create `src/components/admin/PlaylistScreen.tsx`; Modify `src/lib/adminApi.ts`, `src/components/admin/AdminShell.tsx` (Playlist becomes a link), `src/pages/AdminPage.tsx`; Test `src/components/admin/__tests__/PlaylistScreen.test.tsx`, `src/lib/__tests__/adminApi.test.ts`, `src/pages/__tests__/AdminPage.test.tsx`.

**Interfaces:** `adminApi` gains `getStreams(filters, signal?)`, `addStream`, `updateStream`, `pinStream`, `setDefaultStream` and `removeStream` (the same result shape and error mapping as the channel actions, including `not_found`). `PlaylistScreen` shows a filter row (text, state, country), a paged table (name, state, country, groups, pinned, default), an add form (address, name, group) that shows the rule that rejected an address, per-row edit of name and groups, pin, set default, and Remove with a "cannot be undone here" confirm (as in `ChannelsScreen`), with loading, empty and error states.

- [ ] **Step 1: Failing tests:** each state of the screen and each action (including a hostile name shown as text, a double click making one request and a rejected add showing its reason), the new client calls, and the menu link.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the files, the whole suite, the type check and lint: PASS. Commit `feat: Playlist screen in the admin panel`.

### Task 25: Stage C acceptance (owner-run)

- [ ] **Step 1 (owner):** on `http://localhost:5000/admin/playlist` add a stream, rename it, pin it, set another as the default and remove one; the HLS page shows each change within the snapshot's cache time (five minutes, or after a reload that bypasses the cache); Security shows the audit rows.
- [ ] **Step 2:** Update the notes and the PR; commit `docs: piece 2 stage C notes`.
