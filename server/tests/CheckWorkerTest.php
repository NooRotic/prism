<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Checker\CheckerState;
use Prism\History\Checker\CheckWorker;
use Prism\History\Checker\HostPacer;
use Prism\History\Checker\StreamChecker;
use Prism\History\Net\FetchPolicy;
use Prism\History\Net\PinnedResponse;
use Prism\History\Net\Resolver;
use Prism\History\Net\SafeFetcher;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\JobState;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\RoutedTransport;
use Throwable;

/** The worker over a real database, with answers decided by host: ok, dead (HTTP 500) or flaky (the playlist fails once). */
final class CheckWorkerTest extends DbTestCase
{
    private const MB = 1_048_576;

    private StreamStore $store;
    private CheckerState $state;
    private FakeSleeper $sleeper;
    private RoutedTransport $transport;
    private string $dir;

    /** @var array<string,string> host => ok|dead (HTTP 500)|down (no answer at all)|flaky (the playlist fails once); a host not listed is ok */
    private array $modes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->state = new CheckerState(new JobState($this->pdo, $this->clock), $this->clock);
        $this->sleeper = new FakeSleeper($this->clock);
        $this->dir = sys_get_temp_dir() . '/prism-worker-' . bin2hex(random_bytes(4));
        mkdir($this->dir . '/data', 0777, true);
        mkdir($this->dir . '/logos', 0777, true);
        $this->transport = new RoutedTransport(fn (string $url, int $attempt, string $host): PinnedResponse|Throwable => $this->route($url, $attempt, $host), $this->clock);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/{data,logos}/*', GLOB_BRACE) ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->dir . '/data');
        @rmdir($this->dir . '/logos');
        @rmdir($this->dir);
    }

    private function route(string $url, int $attempt, string $host): PinnedResponse|Throwable
    {
        $mode = $this->modes[$host] ?? 'ok';
        $segment = str_ends_with($url, '.ts');
        if ($mode === 'down') {
            return new \RuntimeException('no answer');
        }
        if ($mode === 'dead' || ($mode === 'flaky' && !$segment && $attempt === 1)) {
            return RoutedTransport::dead();
        }

        return $segment ? RoutedTransport::segment() : RoutedTransport::playlist();
    }

    private function worker(int $firstPassCap = 4096 * self::MB, int $dailyCap = 1024 * self::MB): CheckWorker
    {
        $resolver = new class implements Resolver {
            public function ips(string $host): array
            {
                return str_ends_with($host, '.test') ? ['93.184.216.34'] : [];
            }
        };
        $pacer = new HostPacer($this->sleeper, $this->clock);
        $checker = new StreamChecker(
            new SafeFetcher($resolver, $this->transport, 'PRISM-test/1', 3, FetchPolicy::checker()),
            'https://prism.nooroticx.tv',
            $this->clock,
            StreamChecker::DENY_HOSTS,
            $pacer,
        );

        return new CheckWorker(
            $this->store,
            $checker,
            $this->state,
            $this->clock,
            new SnapshotWriter($this->store, $this->clock, $this->dir . '/data'),
            $this->dir . '/logos',
            $dailyCap,
            $firstPassCap,
            $pacer,
        );
    }

    /** @param array<string,mixed> $extra @return array<string,mixed> */
    private function put(string $host, string $n, array $extra = []): array
    {
        $url = 'https://' . $host . '/s' . $n . '.m3u8';
        $id = StreamUrl::id($url);
        $row = array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'Stream ' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test',
        ], $extra);
        $this->store->insertIfNew($row);

        return $row;
    }

    /** @return array<string,mixed> */
    private function raw(array $row): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM streams WHERE id = ?');
        $stmt->execute([$row['id']]);

        return $stmt->fetch();
    }

    private function snapshotFile(): string
    {
        return $this->dir . '/data/streams.json';
    }

    /** @return list<string> */
    private function requested(): array
    {
        return array_map(static fn (array $c): string => $c['url'], $this->transport->calls);
    }

    // ---- shadow and live

    public function testTheShadowRunRecordsEveryResultAndChangesNothingVisitorsSee(): void
    {
        $this->modes['b.test'] = 'dead';
        $a = $this->put('a.test', '1');
        $b = $this->put('b.test', '2');
        $c = $this->put('c.test', '3');

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame(['checked' => 3, 'passed' => 2, 'failed' => 1, 'guarded' => 0, 'voided' => 0, 'stopped' => null], array_diff_key($r, ['bytes' => 0]));
        foreach ([$a, $b, $c] as $row) {
            $this->assertSame('new', $this->raw($row)['state']);
        }
        $this->assertSame(['pass', 'http_status', 'pass'], [$this->raw($a)['check_result'], $this->raw($b)['check_result'], $this->raw($c)['check_result']]);
        $recorded = $this->raw($a);
        $this->assertSame(gmdate('Y-m-d H:i:s', strtotime($recorded['last_checked_at'] . ' UTC') + 86_400), $recorded['next_check_at'], 'due a day after the check');
        $this->assertFileDoesNotExist($this->snapshotFile(), 'the snapshot is not written before Apply');
    }

    public function testBytesAreCountedAndFactsAreKept(): void
    {
        $a = $this->put('a.test', '1');

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertGreaterThan(1000, $r['bytes']);
        $this->assertSame($r['bytes'], $this->state->firstPassBytes());
        $this->assertSame($r['bytes'], (int) $this->raw($a)['check_bytes']);
        $this->assertSame(['live' => false, 'variants' => 1, 'codecs' => [], 'captions' => [], 'audio_languages' => []], json_decode((string) $this->raw($a)['facts_json'], true));
    }

    public function testAfterApplyEachResultMovesTheStateAndTheSnapshotIsRewritten(): void
    {
        $this->state->markApplied();
        $this->modes['bad.test'] = 'dead';
        $newGood = $this->put('good.test', '1');
        $newBad = $this->put('bad.test', '2');
        $workingBad = $this->put('bad.test', '3', ['state' => 'working', 'ever_passed' => 1]);
        $deadGood = $this->put('good.test', '4', ['state' => 'dead', 'state_reason' => 'never_passed']);

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame(4, $r['checked']);
        $this->assertSame(['working', null], [$this->raw($newGood)['state'], $this->raw($newGood)['state_reason']]);
        $this->assertSame(['dead', 'never_passed'], [$this->raw($newBad)['state'], $this->raw($newBad)['state_reason']]);
        $this->assertSame(['suspect', null], [$this->raw($workingBad)['state'], $this->raw($workingBad)['state_reason']]);
        $this->assertSame(['working', null], [$this->raw($deadGood)['state'], $this->raw($deadGood)['state_reason']]);
        $names = array_map(static fn (array $s): string => $s['n'], json_decode((string) file_get_contents($this->snapshotFile()), true)['streams']);
        sort($names);
        $this->assertSame(['Stream 1', 'Stream 3', 'Stream 4'], $names, 'working, suspect and the recovered stream are listed; the dead one is not');
    }

    public function testTheSnapshotIsNotRewrittenWhenNoStreamChangedBetweenListedAndHidden(): void
    {
        $this->state->markApplied();
        $this->put('good.test', '1', ['state' => 'working', 'ever_passed' => 1]);

        $this->worker()->run(0, 1, 100, false);

        $this->assertFileDoesNotExist($this->snapshotFile());
    }

    public function testASkippedStreamIsNeverFetchedAndIsNotLookedAtAgainAtOnce(): void
    {
        $row = $this->put('www.twitch.tv', '1');

        $this->worker()->run(0, 1, 100, false);
        $this->assertSame('skipped', $this->raw($row)['check_result']);
        $this->assertSame([], $this->transport->calls);

        $this->state->markApplied();
        $this->clock->advanceMs(86_400_000);
        $this->worker()->run(0, 1, 100, false);
        $this->assertSame(['new', '2026-11-14 03:00:00'], [$this->raw($row)['state'], $this->raw($row)['next_check_at']], 'still new, and due a day after this look, not at once');
        $this->assertSame([], $this->transport->calls);
    }

    public function testNoCorsCountsAsAFailureInTheSummary(): void
    {
        $this->put('a.test', '1');
        $this->transport = new RoutedTransport(
            static fn (string $url): PinnedResponse => str_ends_with($url, '.ts') ? RoutedTransport::segment() : new PinnedResponse(200, [], "#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n", false),
            $this->clock,
        );

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame([1, 0, 1], [$r['checked'], $r['passed'], $r['failed']]);
    }

    // ---- what the worker must leave alone

    public function testStreamsTheOwnerRemovedAreNeverFetched(): void
    {
        $this->put('gone.test', '1', ['state' => 'removed']);
        $this->put('gone.test', '2', ['state' => 'removed', 'state_reason' => 'owner']);
        $this->put('http.test', '3', ['state' => 'unplayable', 'state_reason' => 'http']);
        $this->put('port.test', '4', ['state' => 'held', 'state_reason' => 'port']);
        $this->put('ok.test', '5');

        $this->worker()->run(0, 1, 100, false);

        $hosts = array_unique(array_map(static fn (array $c): string => $c['host'], $this->transport->calls));
        $this->assertSame(['ok.test'], array_values($hosts));
    }

    public function testAnOwnerChangeWhileAStreamIsBeingCheckedIsNotOverwritten(): void
    {
        $this->state->markApplied();
        $this->modes['bad.test'] = 'dead';
        $removed = $this->put('bad.test', '1');
        $pinned = $this->put('good.test', '2');
        $this->transport->onCall = function (string $url) use ($removed, $pinned): void {
            if (str_ends_with($url, '/s1.m3u8')) {
                $this->pdo->exec("UPDATE streams SET state = 'removed', state_reason = NULL WHERE id = '" . $removed['id'] . "'");
            }
            if (str_ends_with($url, '/s2.m3u8')) {
                $this->pdo->exec("UPDATE streams SET pinned = 1 WHERE id = '" . $pinned['id'] . "'");
            }
        };

        $this->worker()->run(0, 1, 100, false);

        $r = $this->raw($removed);
        $this->assertSame(['removed', null, null], [$r['state'], $r['state_reason'], $r['check_result']], 'the owner removed it mid-check: the result is dropped');
        $p = $this->raw($pinned);
        $this->assertSame(['working', 1], [$p['state'], (int) $p['pinned']], 'a pin made mid-check survives the write');
    }

    public function testAnAutoRemovalDeletesTheLogoCopyButAPinnedStreamStaysDead(): void
    {
        $this->state->markApplied();
        $this->modes['dead.test'] = 'dead';
        file_put_contents($this->dir . '/logos/abcdef012345.png', 'png');
        file_put_contents($this->dir . '/logos/abcdef012346.png', 'png');
        $old = '2026-10-01 00:00:00';
        $plain = $this->put('dead.test', '1', ['state' => 'dead', 'state_reason' => 'failed_3_days', 'ever_passed' => 1, 'state_changed_at' => $old, 'logo_file' => 'abcdef012345.png']);
        $pinned = $this->put('dead.test', '2', ['state' => 'dead', 'state_reason' => 'failed_3_days', 'ever_passed' => 1, 'state_changed_at' => $old, 'pinned' => 1, 'logo_file' => 'abcdef012346.png']);

        $this->worker()->run(0, 1, 100, false);

        $this->assertSame(['removed', 'dead_14_days'], [$this->raw($plain)['state'], $this->raw($plain)['state_reason']]);
        $this->assertFileDoesNotExist($this->dir . '/logos/abcdef012345.png');
        $this->assertSame(['dead', 'failed_3_days', 1], [$this->raw($pinned)['state'], $this->raw($pinned)['state_reason'], (int) $this->raw($pinned)['pinned']]);
        $this->assertFileExists($this->dir . '/logos/abcdef012346.png', 'a pinned stream keeps its picture');
    }

    // ---- retries and guards

    public function testAFailedCheckIsRetriedOnceAtTheEndOfTheBatchAndAPassOnTheRetryCounts(): void
    {
        $this->modes['flaky.test'] = 'flaky';
        $flaky = $this->put('flaky.test', '1');
        foreach (['a', 'b', 'c'] as $h) {
            $this->put($h . '.test', '2');
        }

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame([4, 4, 0], [$r['checked'], $r['passed'], $r['failed']]);
        $this->assertSame('pass', $this->raw($flaky)['check_result']);
        $urls = $this->requested();
        $mine = array_keys(array_filter($urls, static fn (string $u): bool => $u === 'https://flaky.test/s1.m3u8'));
        $others = array_keys(array_filter($urls, static fn (string $u): bool => str_ends_with($u, '/s2.m3u8')));
        $this->assertCount(2, $mine, 'asked for twice');
        $this->assertGreaterThan(max($others), $mine[1], 'the second ask comes after every other stream has been checked once');
    }

    public function testAStreamThatFailsTheRetryTooIsAFailureAfterExactlyTwoAsks(): void
    {
        $this->modes['bad.test'] = 'dead';
        $bad = $this->put('bad.test', '1');

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame([1, 0, 1], [$r['checked'], $r['passed'], $r['failed']]);
        $this->assertSame('http_status', $this->raw($bad)['check_result']);
        $this->assertCount(2, array_filter($this->requested(), static fn (string $u): bool => $u === 'https://bad.test/s1.m3u8'));
    }

    public function testTheHostGuardSetsAsideTheFailuresOfStreamsThatPassedBeforeButNotOfOnesThatNeverDid(): void
    {
        $this->state->markApplied();
        $this->modes['g.test'] = 'dead';
        $proven = [];
        foreach (['1', '2', '3'] as $n) {
            $proven[] = $this->put('g.test', $n, ['state' => 'working', 'ever_passed' => 1]);
        }
        $never = $this->put('g.test', '4');
        $other = $this->put('ok.test', '5');

        $r = $this->worker()->run(0, 1, 100, false);

        foreach ($proven as $row) {
            $raw = $this->raw($row);
            $this->assertSame(['working', 'host_guard'], [$raw['state'], $raw['check_result']]);
        }
        $this->assertSame(['dead', 'never_passed'], [$this->raw($never)['state'], $this->raw($never)['state_reason']]);
        $this->assertSame('working', $this->raw($other)['state']);
        $this->assertSame(3, $r['guarded']);
        $this->assertSame(1, $r['failed']);
    }

    public function testTheRunGuardStopsTheWorkerAndVoidsTheStreamsThatVoted(): void
    {
        for ($i = 1; $i <= 60; $i++) {
            $this->modes['d' . $i . '.test'] = 'down';
            $this->put('d' . $i . '.test', (string) $i);
        }

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertSame('run_guard', $r['stopped']);
        $this->assertSame([0, 50], [$r['checked'], $r['voided']]);
        $this->assertSame(50, (int) $this->pdo->query("SELECT COUNT(*) FROM streams WHERE check_result = 'voided'")->fetchColumn());
        $this->assertSame(10, (int) $this->pdo->query('SELECT COUNT(*) FROM streams WHERE check_result IS NULL')->fetchColumn(), 'the ten not yet reached are untouched');
        $this->assertSame(0, (int) $this->pdo->query("SELECT COUNT(*) FROM streams WHERE state <> 'new'")->fetchColumn());
        $this->assertCount(50, $this->transport->calls, 'it stopped before any retry');
        $this->assertSame('run_guard', $this->state->lastStop()['reason'] ?? null);
        $this->assertSame(['eligible' => 60, 'checked' => 0, 'oldest_result_at' => null], $this->store->firstPass(), 'a voided check is still to be done');
    }

    public function testOneBigHostThatIsDownIsNotANetworkProblem(): void
    {
        $this->modes['big.test'] = 'down';
        for ($i = 1; $i <= 60; $i++) {
            $this->put('big.test', 'b' . $i);
        }
        for ($i = 1; $i <= 55; $i++) {
            $this->put('ok' . $i . '.test', 'o' . $i);
        }

        $r = $this->worker()->run(0, 1, 200, false);

        $this->assertNull($r['stopped'], 'round-robin leaves the big host alone at the end of the batch, and it is one host');
        $this->assertSame([115, 55, 60], [$r['checked'], $r['passed'], $r['failed']]);
        $this->assertSame(0, (int) $this->pdo->query("SELECT COUNT(*) FROM streams WHERE check_result = 'voided'")->fetchColumn());
    }

    public function testStreamsThatAreExpectedToFailDoNotFeedTheGuard(): void
    {
        $this->state->markApplied();
        for ($i = 1; $i <= 60; $i++) {
            $this->modes['s' . $i . '.test'] = 'down';
            $this->put('s' . $i . '.test', 's' . $i, ['state' => 'suspect', 'ever_passed' => 1]);
        }
        for ($i = 1; $i <= 20; $i++) {
            $this->put('ok' . $i . '.test', 'o' . $i, ['state' => 'working', 'ever_passed' => 1]);
        }

        $r = $this->worker()->run(0, 1, 200, false);

        $this->assertNull($r['stopped'], 'suspect streams head the queue and are expected to fail: they are not evidence about the network');
        $this->assertSame([80, 60], [$r['checked'], $r['failed']]);
    }

    public function testAnAnswerFromAHostIsNeverEvidenceOfANetworkProblem(): void
    {
        for ($i = 1; $i <= 60; $i++) {
            $this->modes['e' . $i . '.test'] = 'dead'; // every host answers, with an error
            $this->put('e' . $i . '.test', (string) $i);
        }

        $r = $this->worker()->run(0, 1, 200, false);

        $this->assertNull($r['stopped']);
        $this->assertSame([60, 60], [$r['checked'], $r['failed']]);
    }

    public function testAfterATripTheNextLaunchFinishesTheJobOnceTheNetworkIsBack(): void
    {
        for ($i = 1; $i <= 60; $i++) {
            $this->modes['d' . $i . '.test'] = 'down';
            $this->put('d' . $i . '.test', (string) $i);
        }
        $first = $this->worker()->run(0, 1, 100, false);
        $this->assertSame('run_guard', $first['stopped']);

        $this->modes = []; // the network is back
        $second = $this->worker()->run(0, 1, 100, false);

        $this->assertNull($second['stopped']);
        $this->assertSame([60, 60], [$second['checked'], $second['passed']], 'the voided streams and the ones never reached are all checked');
        $this->assertSame(['eligible' => 60, 'checked' => 60], array_intersect_key($this->store->firstPass(), ['eligible' => 1, 'checked' => 1]));
    }

    // ---- stops, slices, pacing, batches

    public function testPausedAndTheCapStopTheWorkerBeforeItTouchesAnything(): void
    {
        $this->put('a.test', '1');
        $this->state->setPaused(true);

        $paused = $this->worker()->run(0, 1, 100, false);
        $this->assertSame([0, 'paused'], [$paused['checked'], $paused['stopped']]);
        $this->assertSame([], $this->transport->calls);

        $this->state->setPaused(false);
        $this->state->addBytes(1000);
        $capped = $this->worker(1000)->run(0, 1, 100, false);
        $this->assertSame([0, 'cap'], [$capped['checked'], $capped['stopped']]);
        $this->assertSame([], $this->transport->calls);
    }

    public function testTheCapStopsAMidRunOnceTheTotalIsReached(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->put('h' . $i . '.test', (string) $i);
        }

        $r = $this->worker(1500)->run(0, 1, 100, false);

        $this->assertSame('cap', $r['stopped']);
        $this->assertSame(2, $r['checked'], 'each check reads a little over a kilobyte: the third finds the 1500 reached');
    }

    public function testTwoWorkersNeverTouchTheSameHost(): void
    {
        for ($i = 1; $i <= 6; $i++) {
            $this->put('s' . $i . '.test', 'a');
            $this->put('s' . $i . '.test', 'b');
        }

        $first = $this->worker()->run(0, 2, 100, false);
        $hostsFirst = array_unique(array_map(static fn (array $c): string => $c['host'], $this->transport->calls));
        $callsBefore = count($this->transport->calls);
        $second = $this->worker()->run(1, 2, 100, false);
        $hostsSecond = array_unique(array_map(static fn (array $c): string => $c['host'], array_slice($this->transport->calls, $callsBefore)));

        $this->assertSame([], array_intersect($hostsFirst, $hostsSecond));
        $this->assertSame(12, $first['checked'] + $second['checked'], 'between them every stream is checked exactly once');
    }

    public function testRequestsToOneHostAreAtLeastASecondApart(): void
    {
        foreach (['p.test', 'q.test'] as $host) {
            foreach (['1', '2', '3'] as $n) {
                $this->put($host, $n);
            }
        }

        $this->worker()->run(0, 1, 100, false);

        foreach (['p.test', 'q.test'] as $host) {
            $times = array_values(array_map(static fn (array $c): int => $c['at'], array_filter($this->transport->calls, static fn (array $c): bool => $c['host'] === $host)));
            $this->assertCount(6, $times, $host);
            for ($i = 1; $i < count($times); $i++) {
                $this->assertGreaterThanOrEqual(1000, $times[$i] - $times[$i - 1], $host . ' request ' . $i);
            }
        }
    }

    public function testTheFirstPassKeepsTakingBatchesWhileAnOrdinaryRunTakesOne(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->put('b' . $i . '.test', (string) $i);
        }

        $ordinary = $this->worker()->run(0, 1, 2, false);
        $this->assertSame(2, $ordinary['checked']);

        $first = $this->worker()->run(0, 1, 2, true);
        $this->assertSame(3, $first['checked'], 'the rest, two and then one');
    }

    public function testNothingInTheSummaryNamesAStream(): void
    {
        $this->modes['bad.test'] = 'dead';
        $this->put('bad.test', '1');
        $this->put('ok.test', '2');

        $r = $this->worker()->run(0, 1, 100, false);

        $this->assertStringNotContainsString('.test', (string) json_encode($r));
    }
}
