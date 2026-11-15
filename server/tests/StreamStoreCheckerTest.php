<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Checker\CheckResult;
use Prism\History\Checker\Transition;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;

/** The checker's side of the streams table: which streams are due, how a result is recorded and applied, and the reports. */
final class StreamStoreCheckerTest extends DbTestCase
{
    private StreamStore $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
    }

    /** Inserts a stream on host `host<n>.test` (or the host given) and returns the row. @param array<string,mixed> $extra */
    private function put(string $n, array $extra = [], ?string $host = null): array
    {
        $url = 'https://' . ($host ?? 'host' . $n . '.test') . '/live' . $n . '.m3u8';
        $id = StreamUrl::id($url);
        $row = array_merge([
            'id' => $id,
            'public_id' => StreamUrl::publicId($id),
            'url' => $url,
            'name' => 'Stream ' . $n,
            'groups_json' => '["News"]',
            'kind' => 'hls',
            'state' => 'new',
            'source' => 'test',
            'added_at' => '2026-11-12 03:00:00',
        ], $extra);
        $this->store->insertIfNew($row);

        return $row;
    }

    /** @return array<string,mixed> */
    private function raw(string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM streams WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->fetch();
    }

    private function now(): int
    {
        return $this->clock->nowMs();
    }

    public function testInsertSetsTheHostFromTheAddress(): void
    {
        $row = $this->put('1', ['url' => 'https://cdn.example:8443/a.m3u8', 'id' => StreamUrl::id('https://cdn.example:8443/a.m3u8'), 'public_id' => StreamUrl::publicId(StreamUrl::id('https://cdn.example:8443/a.m3u8'))]);

        $this->assertSame('cdn.example', $this->raw($row['id'])['host']);
    }

    public function testRowsFromTheStoreCarryTheCheckerFieldsTyped(): void
    {
        $row = $this->put('1', ['ever_passed' => 1, 'fail_days' => 2, 'last_fail_day' => '2026-11-11', 'check_result' => 'pass', 'state_changed_at' => '2026-11-10 00:00:00', 'next_check_at' => '2026-11-13 00:00:00']);

        $found = $this->store->findByPublicId($row['public_id']);

        $this->assertSame(['host1.test', 1, 2, '2026-11-11', 'pass', '2026-11-10 00:00:00', '2026-11-13 00:00:00'], [
            $found['host'], $found['ever_passed'], $found['fail_days'], $found['last_fail_day'], $found['check_result'], $found['state_changed_at'], $found['next_check_at'],
        ]);
    }

    public function testDueForCheckGivesEachWorkerItsOwnSliceOfHosts(): void
    {
        $ids = [];
        for ($i = 1; $i <= 12; $i++) {
            $ids[] = $this->put((string) $i)['id'];
        }

        $seen = [];
        foreach ([0, 1, 2] as $worker) {
            foreach ($this->store->dueForCheck($worker, 3, 100, $this->now()) as $row) {
                $this->assertSame($worker, crc32((string) $row['host']) % 3, 'a row is in the slice of its host');
                $seen[] = $row['id'];
            }
        }

        sort($ids);
        sort($seen);
        $this->assertSame($ids, $seen, 'every stream is in exactly one slice');
    }

    public function testStreamsOnOneHostAreAlwaysInOneSlice(): void
    {
        for ($i = 1; $i <= 6; $i++) {
            $this->put((string) $i, [], 'shared.test');
        }

        $counts = [];
        foreach ([0, 1, 2, 3] as $worker) {
            $counts[$worker] = count($this->store->dueForCheck($worker, 4, 100, $this->now()));
        }

        $this->assertSame(6, max($counts), 'all six sit in one worker');
        $this->assertSame(6, array_sum($counts));
    }

    public function testDueForCheckOrdersNewAndHeldFirstThenSuspectThenTheOldestCheck(): void
    {
        $this->put('w1', ['state' => 'working', 'last_checked_at' => '2026-11-11 00:00:00']);
        $this->put('w2', ['state' => 'working', 'last_checked_at' => '2026-11-10 00:00:00']);
        $this->put('s', ['state' => 'suspect', 'last_checked_at' => '2026-11-12 00:00:00']);
        $this->put('n', ['state' => 'new']);
        $this->put('h', ['state' => 'held', 'state_reason' => 'awaiting_check']);

        $names = array_map(static fn (array $r): string => $r['name'], $this->store->dueForCheck(0, 1, 100, $this->now()));

        $this->assertEqualsCanonicalizing(['Stream n', 'Stream h'], array_slice($names, 0, 2));
        $this->assertSame(['Stream s', 'Stream w2', 'Stream w1'], array_slice($names, 2));
    }

    public function testDueForCheckSkipsWhatIsNotDueAndWhatTheCheckerDoesNotOwn(): void
    {
        $now = '2026-11-12 03:00:00';
        $due = [
            $this->put('a', ['state' => 'working'])['id'],
            $this->put('b', ['state' => 'working', 'next_check_at' => $now])['id'],
            $this->put('c', ['state' => 'working', 'next_check_at' => '2026-11-11 00:00:00'])['id'],
            $this->put('d', ['state' => 'dead', 'state_reason' => 'never_passed'])['id'],
            $this->put('e', ['state' => 'unplayable', 'state_reason' => 'no_cors'])['id'],
            $this->put('f', ['state' => 'removed', 'state_reason' => 'dead_14_days'])['id'],
            $this->put('g', ['state' => 'held', 'state_reason' => 'awaiting_check'])['id'],
        ];
        $this->put('later', ['state' => 'working', 'next_check_at' => '2026-11-12 03:00:01']);
        $this->put('owner1', ['state' => 'removed']);
        $this->put('owner2', ['state' => 'removed', 'state_reason' => 'owner']);
        $this->put('http', ['state' => 'unplayable', 'state_reason' => 'http']);
        $this->put('port', ['state' => 'held', 'state_reason' => 'port']);

        $got = array_map(static fn (array $r): string => $r['id'], $this->store->dueForCheck(0, 1, 100, $this->now()));

        sort($due);
        sort($got);
        $this->assertSame($due, $got);
    }

    public function testDueForCheckHonoursTheLimit(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->put((string) $i);
        }

        $this->assertCount(2, $this->store->dueForCheck(0, 1, 2, $this->now()));
        $this->assertSame([], $this->store->dueForCheck(0, 1, 0, $this->now()));
    }

    public function testRecordShadowWritesTheResultAndNeverTheState(): void
    {
        $row = $this->put('1', ['state' => 'working']);

        $this->store->recordShadow($row['id'], new CheckResult('unreachable', 321, ['live' => true]), $this->now());

        $r = $this->raw($row['id']);
        $this->assertSame('working', $r['state']);
        $this->assertSame(['unreachable', 321, '2026-11-12 03:00:00', '2026-11-13 03:00:00'], [$r['check_result'], (int) $r['check_bytes'], $r['last_checked_at'], $r['next_check_at']]);
        $this->assertSame(['live' => true], json_decode((string) $r['facts_json'], true));
    }

    public function testARecordWithoutFactsKeepsTheFactsAlreadyThere(): void
    {
        $row = $this->put('1', ['facts_json' => '{"live":false}']);

        $this->store->recordShadow($row['id'], new CheckResult('http_status'), $this->now());

        $this->assertSame('{"live":false}', $this->raw($row['id'])['facts_json']);
    }

    public function testApplyTransitionWritesTheNewStateAndTheResult(): void
    {
        $row = $this->put('1');
        $t = new Transition('dead', 'never_passed', false, 0, null, true);

        $this->assertTrue($this->store->applyTransition($row['id'], 'new', null, $t, new CheckResult('http_status', 55), $this->now()));

        $r = $this->raw($row['id']);
        $this->assertSame(['dead', 'never_passed', 0, 0, null], [$r['state'], $r['state_reason'], (int) $r['ever_passed'], (int) $r['fail_days'], $r['last_fail_day']]);
        $this->assertSame(['http_status', 55, '2026-11-12 03:00:00'], [$r['check_result'], (int) $r['check_bytes'], $r['last_checked_at']]);
        $this->assertSame('2026-11-13 03:00:00', $r['next_check_at'], 'dead and never passed: a day');
        $this->assertSame('2026-11-12 03:00:00', $r['state_changed_at']);
    }

    public function testAnUnchangedTransitionLeavesTheTimeOfTheLastChange(): void
    {
        $row = $this->put('1', ['state' => 'suspect', 'fail_days' => 1, 'last_fail_day' => '2026-11-12', 'ever_passed' => 1, 'state_changed_at' => '2026-11-12 01:00:00']);
        $t = new Transition('suspect', null, true, 1, '2026-11-12', false);

        $this->assertTrue($this->store->applyTransition($row['id'], 'suspect', null, $t, new CheckResult('unreachable'), $this->now()));

        $this->assertSame('2026-11-12 01:00:00', $this->raw($row['id'])['state_changed_at']);
        $this->assertSame('2026-11-12 09:00:00', $this->raw($row['id'])['next_check_at'], 'suspect: six hours');
    }

    public function testATransitionIsDroppedWhenTheRowChangedUnderTheWorker(): void
    {
        $row = $this->put('1', ['state' => 'working', 'ever_passed' => 1]);
        $t = new Transition('suspect', null, true, 1, '2026-11-12', true);

        $this->assertFalse($this->store->applyTransition($row['id'], 'new', null, $t, new CheckResult('unreachable'), $this->now()), 'the state differs');
        $this->assertFalse($this->store->applyTransition($row['id'], 'working', 'owner', $t, new CheckResult('unreachable'), $this->now()), 'the reason differs');

        $r = $this->raw($row['id']);
        $this->assertSame(['working', null, null], [$r['state'], $r['state_reason'], $r['check_result']]);
    }

    public function testApplyingTwiceTheSameTransitionStillSucceedsWhenTheRowMatches(): void
    {
        $row = $this->put('1', ['state' => 'suspect', 'ever_passed' => 1, 'fail_days' => 1, 'last_fail_day' => '2026-11-12']);
        $t = new Transition('suspect', null, true, 1, '2026-11-12', false);

        $this->assertTrue($this->store->applyTransition($row['id'], 'suspect', null, $t, new CheckResult('unreachable', 1), $this->now()));
        $this->assertTrue($this->store->applyTransition($row['id'], 'suspect', null, $t, new CheckResult('unreachable', 1), $this->now()), 'identical values must not read as a lost race');
    }

    public function testAutoRemovalClearsTheLogoCopyName(): void
    {
        $row = $this->put('1', ['state' => 'dead', 'state_reason' => 'failed_3_days', 'ever_passed' => 1, 'logo_file' => 'abcdef012345.png']);
        $t = new Transition('removed', 'dead_14_days', true, 3, '2026-11-12', true);

        $this->assertTrue($this->store->applyTransition($row['id'], 'dead', 'failed_3_days', $t, new CheckResult('unreachable'), $this->now()));

        $r = $this->raw($row['id']);
        $this->assertSame(['removed', 'dead_14_days'], [$r['state'], $r['state_reason']]);
        $this->assertNull($r['logo_file']);
    }

    public function testApplyingWithoutRecordingTheResultLeavesTheResultColumnsAlone(): void
    {
        $row = $this->put('1', ['check_result' => 'http_status', 'check_bytes' => 7, 'facts_json' => '{"a":1}', 'last_checked_at' => '2026-11-10 00:00:00']);
        $t = new Transition('dead', 'never_passed', false, 0, null, true);

        $this->assertTrue($this->store->applyTransition($row['id'], 'new', null, $t, new CheckResult('http_status'), $this->now(), false));

        $r = $this->raw($row['id']);
        $this->assertSame('dead', $r['state']);
        $this->assertSame(['http_status', 7, '{"a":1}', '2026-11-10 00:00:00'], [$r['check_result'], (int) $r['check_bytes'], $r['facts_json'], $r['last_checked_at']]);
        $this->assertSame('2026-11-13 03:00:00', $r['next_check_at']);
    }

    public function testASkippedNewStreamIsNotDueAgainAtOnce(): void
    {
        $row = $this->put('1');
        $t = new Transition('new', null, false, 0, null, false);

        $this->store->applyTransition($row['id'], 'new', null, $t, new CheckResult('skipped'), $this->now());

        $this->assertSame('2026-11-13 03:00:00', $this->raw($row['id'])['next_check_at'], 'a day, not now');
    }

    public function testMarkVoidedMakesTheseStreamsDueAtOnceAndTouchesNoOtherRow(): void
    {
        $a = $this->put('a', ['state' => 'working', 'check_result' => 'pass', 'next_check_at' => '2026-11-20 00:00:00']);
        $b = $this->put('b', ['state' => 'working', 'check_result' => 'pass', 'next_check_at' => '2026-11-20 00:00:00']);

        $this->store->markVoided([$a['id']], $this->now());
        $this->store->markVoided([], $this->now());

        $this->assertSame(['voided', '2026-11-12 03:00:00'], [$this->raw($a['id'])['check_result'], $this->raw($a['id'])['next_check_at']]);
        $this->assertSame(['pass', '2026-11-20 00:00:00'], [$this->raw($b['id'])['check_result'], $this->raw($b['id'])['next_check_at']]);
    }

    public function testFirstPassProgressCountsTheEligibleStatesOnly(): void
    {
        $this->assertSame(['eligible' => 0, 'checked' => 0, 'oldest_result_at' => null], $this->store->firstPass());

        $this->put('1', ['state' => 'new', 'check_result' => 'pass', 'last_checked_at' => '2026-11-10 00:00:00']);
        $this->put('2', ['state' => 'working', 'check_result' => 'http_status', 'last_checked_at' => '2026-11-11 00:00:00']);
        $this->put('3', ['state' => 'suspect']);
        $this->put('4', ['state' => 'held', 'state_reason' => 'awaiting_check', 'check_result' => 'unreachable', 'last_checked_at' => '2026-11-12 00:00:00']);
        $this->put('5', ['state' => 'new']);
        $this->put('6', ['state' => 'dead', 'state_reason' => 'never_passed', 'check_result' => 'pass', 'last_checked_at' => '2026-11-01 00:00:00']);
        $this->put('7', ['state' => 'held', 'state_reason' => 'port']);

        $this->assertSame(['eligible' => 5, 'checked' => 3, 'oldest_result_at' => '2026-11-10 00:00:00'], $this->store->firstPass());
    }

    public function testAVoidedResultIsNotACheckedStream(): void
    {
        $this->put('1', ['state' => 'new', 'check_result' => 'pass', 'last_checked_at' => '2026-11-10 00:00:00']);
        $this->put('2', ['state' => 'new', 'check_result' => 'voided', 'last_checked_at' => '2026-11-05 00:00:00']);

        $this->assertSame(['eligible' => 2, 'checked' => 1, 'oldest_result_at' => '2026-11-10 00:00:00'], $this->store->firstPass(), 'the run guard threw that check away: it still has to be done');
    }

    public function testResultCountsCountTheLatestResultOfEachEligibleStream(): void
    {
        $this->put('1', ['check_result' => 'pass']);
        $this->put('2', ['state' => 'working', 'check_result' => 'pass']);
        $this->put('3', ['check_result' => 'unreachable']);
        $this->put('4');
        $this->put('5', ['state' => 'dead', 'state_reason' => 'never_passed', 'check_result' => 'pass']);

        $this->assertSame(['pass' => 2, 'unreachable' => 1], $this->store->resultCounts());
    }

    public function testHostClustersListHostsWhereMoreThanHalfFailed(): void
    {
        foreach (['unreachable', 'unreachable', 'http_status', 'pass'] as $i => $code) {
            $this->put('a' . $i, ['check_result' => $code], 'a.test');
        }
        foreach (['unreachable', 'unreachable', 'pass', 'pass'] as $i => $code) {
            $this->put('b' . $i, ['check_result' => $code], 'b.test');
        }
        foreach (['unreachable', 'unreachable', 'unreachable'] as $i => $code) {
            $this->put('c' . $i, ['check_result' => $code], 'c.test');
        }
        foreach (['unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable', 'pass', 'pass', 'pass'] as $i => $code) {
            $this->put('d' . $i, ['check_result' => $code], 'd.test');
        }
        foreach (['host_guard', 'host_guard', 'unreachable', 'unreachable'] as $i => $code) {
            $this->put('e' . $i, ['check_result' => $code], 'e.test');
        }
        foreach (['no_cors', 'no_cors', 'no_cors', 'pass'] as $i => $code) {
            $this->put('f' . $i, ['check_result' => $code], 'f.test');
        }
        foreach (['unreachable', 'unreachable', 'unreachable', null] as $i => $code) {
            $this->put('g' . $i, ['check_result' => $code], 'g.test');
        }
        foreach (['unreachable', 'unreachable', null, null] as $i => $code) {
            $this->put('h' . $i, ['check_result' => $code], 'h.test');
        }

        $this->assertSame([
            ['host' => 'd.test', 'streams' => 8, 'failed' => 5],
            ['host' => 'a.test', 'streams' => 4, 'failed' => 3],
            ['host' => 'f.test', 'streams' => 4, 'failed' => 3],
            ['host' => 'g.test', 'streams' => 4, 'failed' => 3],
        ], $this->store->hostClusters());
    }

    public function testFlaggedAreDeadStreamsTheOwnerPinnedOrMadeTheDefault(): void
    {
        $pinned = $this->put('1', ['state' => 'dead', 'state_reason' => 'failed_3_days', 'pinned' => 1]);
        $default = $this->put('2', ['state' => 'dead', 'state_reason' => 'never_passed', 'is_default' => 1]);
        $this->put('3', ['state' => 'dead', 'state_reason' => 'never_passed']);
        $this->put('4', ['state' => 'working', 'pinned' => 1]);

        $ids = array_map(static fn (array $r): string => $r['public_id'], $this->store->flagged());

        $this->assertEqualsCanonicalizing([$pinned['public_id'], $default['public_id']], $ids);
    }

    public function testGuardedHostsCountTheirHostGuardResults(): void
    {
        $this->put('1', ['check_result' => 'host_guard', 'state' => 'working'], 'x.test');
        $this->put('2', ['check_result' => 'host_guard', 'state' => 'working'], 'x.test');
        $this->put('3', ['check_result' => 'pass', 'state' => 'working'], 'x.test');
        $this->put('4', ['check_result' => 'host_guard', 'state' => 'working'], 'y.test');
        $this->put('5', ['check_result' => 'unreachable'], 'z.test');

        $this->assertSame([['host' => 'x.test', 'streams' => 2], ['host' => 'y.test', 'streams' => 1]], $this->store->guardedHosts());
    }
}
