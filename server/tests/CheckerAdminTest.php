<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Admin\CheckerAdmin;
use Prism\History\Checker\CheckerState;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\AuditStore;
use Prism\History\Store\JobState;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;

final class CheckerAdminTest extends DbTestCase
{
    private const MB = 1_048_576;
    private const RECENT = '2026-11-12 02:00:00';

    private StreamStore $store;
    private CheckerState $state;
    private CheckerAdmin $admin;
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->state = new CheckerState(new JobState($this->pdo, $this->clock), $this->clock);
        $this->dir = sys_get_temp_dir() . '/prism-checkeradmin-' . bin2hex(random_bytes(4));
        mkdir($this->dir, 0777, true);
        $this->admin = new CheckerAdmin(
            $this->pdo,
            $this->store,
            new AuditStore($this->pdo, $this->clock),
            $this->state,
            new SnapshotWriter($this->store, $this->clock, $this->dir),
            $this->clock,
            1024 * self::MB,
            4096 * self::MB,
        );
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->dir);
    }

    /** @param array<string,mixed> $extra @return array<string,mixed> */
    private function put(string $n, array $extra = [], ?string $host = null): array
    {
        $url = 'https://' . ($host ?? 'host' . $n . '.test') . '/live' . $n . '.m3u8';
        $id = StreamUrl::id($url);
        $row = array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'Stream ' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test',
        ], $extra);
        $this->store->insertIfNew($row);

        return $row;
    }

    /** A stream with a recorded first-pass result. @param array<string,mixed> $extra */
    private function checked(string $n, string $code, array $extra = [], ?string $host = null): array
    {
        return $this->put($n, $extra + ['check_result' => $code, 'last_checked_at' => self::RECENT, 'check_bytes' => 1234], $host);
    }

    /** @return array<string,mixed> */
    private function raw(array $row): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM streams WHERE id = ?');
        $stmt->execute([$row['id']]);

        return $stmt->fetch();
    }

    private function audits(string $action): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM admin_audit WHERE action = ?');
        $stmt->execute([$action]);

        return (int) $stmt->fetchColumn();
    }

    /** The scenario of a typical first pass: two good, two visible failures, one set aside, a proven one failing. @return array<string,array<string,mixed>> */
    private function scenario(): array
    {
        return [
            'good' => $this->checked('1', 'pass'),
            'dead' => $this->checked('2', 'unreachable'),
            'nocors' => $this->checked('3', 'no_cors'),
            'guarded' => $this->checked('4', 'host_guard'),
            'proven_ok' => $this->checked('5', 'pass', ['state' => 'working', 'ever_passed' => 1]),
            'proven_bad' => $this->checked('6', 'unreachable', ['state' => 'working', 'ever_passed' => 1]),
            'held' => $this->checked('7', 'unreachable', ['state' => 'held', 'state_reason' => 'awaiting_check']),
        ];
    }

    // ---- status

    public function testStatusOfAFreshDatabase(): void
    {
        $s = $this->admin->status();

        $this->assertSame('shadow', $s['mode']);
        $this->assertNull($s['applied_at']);
        $this->assertFalse($s['paused']);
        $this->assertSame(['eligible' => 0, 'checked' => 0, 'oldest_result_at' => null], $s['progress']);
        $this->assertSame([], $s['outcome']);
        $this->assertSame(0, $s['would_hide']);
        $this->assertSame([], $s['counts']);
        $this->assertSame([], $s['clusters']);
        $this->assertSame([], $s['guarded_hosts']);
        $this->assertSame([], $s['flagged']);
        $this->assertSame(['bytes_today' => 0, 'daily_cap' => 1024 * self::MB, 'first_pass_bytes' => 0, 'first_pass_cap' => 4096 * self::MB], $s['budget']);
        $this->assertNull($s['last_stop']);
    }

    public function testStatusReportsTheRecordedFirstPass(): void
    {
        $this->scenario();
        $this->put('8'); // not yet checked
        $this->state->addBytes(5000);
        $this->state->recordStop('run_guard');

        $s = $this->admin->status();

        $this->assertSame(['eligible' => 8, 'checked' => 7, 'oldest_result_at' => self::RECENT], $s['progress']);
        $this->assertSame(['host_guard' => 1, 'no_cors' => 1, 'pass' => 2, 'unreachable' => 3], $s['outcome']);
        $this->assertSame(1, $s['would_hide'], 'only a verified stream is visible now: the proven one that now fails would disappear; the unchecked, held and failing new ones are hidden already');
        $this->assertSame(['held' => 1, 'new' => 5, 'working' => 2], $s['counts']);
        $this->assertSame([5000, 5000], [$s['budget']['bytes_today'], $s['budget']['first_pass_bytes']]);
        $this->assertSame(['reason' => 'run_guard', 'at' => '2026-11-12 03:00:00'], $s['last_stop']);
    }

    public function testStatusListsHostClustersGuardedHostsAndFlaggedStreams(): void
    {
        foreach (['unreachable', 'unreachable', 'unreachable', 'pass'] as $i => $code) {
            $this->checked('a' . $i, $code, [], 'bad.test');
        }
        $this->checked('g1', 'host_guard', ['state' => 'working', 'ever_passed' => 1], 'guard.test');
        $pinned = $this->put('p', ['state' => 'dead', 'state_reason' => 'failed_3_days', 'pinned' => 1, 'name' => 'Pinned one']);

        $s = $this->admin->status();

        $this->assertSame([['host' => 'bad.test', 'streams' => 4, 'failed' => 3]], $s['clusters']);
        $this->assertSame([['host' => 'guard.test', 'streams' => 1]], $s['guarded_hosts']);
        $this->assertSame([['public_id' => $pinned['public_id'], 'name' => 'Pinned one', 'pinned' => true, 'is_default' => false, 'state' => 'dead']], $s['flagged']);
    }

    // ---- apply

    public function testApplyRefusesWhileAnEligibleStreamHasNoResult(): void
    {
        $good = $this->checked('1', 'pass');
        $this->put('2');

        $r = $this->admin->apply();

        $this->assertSame(['ok' => false, 'error' => 'refused', 'reason' => 'incomplete'], $r);
        $this->assertSame('new', $this->raw($good)['state']);
        $this->assertNull($this->state->appliedAt());
        $this->assertSame(0, $this->audits('checker.apply'));
    }

    public function testAVoidedResultCountsAsIncomplete(): void
    {
        $this->checked('1', 'pass');
        $this->checked('2', 'voided');

        $this->assertSame('incomplete', $this->admin->apply()['reason']);
    }

    public function testApplyRefusesResultsOlderThanThreeDays(): void
    {
        $this->checked('1', 'pass');
        $this->pdo->exec("UPDATE streams SET last_checked_at = '2026-11-08 02:00:00'");

        $this->assertSame(['ok' => false, 'error' => 'refused', 'reason' => 'stale'], $this->admin->apply());

        $this->pdo->exec("UPDATE streams SET last_checked_at = '2026-11-09 03:00:00'");
        $this->assertTrue($this->admin->apply()['ok'], 'exactly three days is still fresh');
    }

    public function testApplyRefusesWhenTwoThirdsOrMoreOfTheResultsAreFailures(): void
    {
        $this->checked('1', 'pass');
        $this->checked('2', 'unreachable');
        $this->checked('3', 'unreachable');

        $this->assertSame(['ok' => false, 'error' => 'refused', 'reason' => 'too_many_failures'], $this->admin->apply());
        $this->assertSame(0, $this->audits('checker.apply'));
    }

    public function testApplyAllowsLessThanTwoThirdsAndNoInformationIsNotAFailure(): void
    {
        $this->checked('1', 'pass');
        $this->checked('2', 'unreachable');
        $this->checked('3', 'host_guard');
        $this->checked('4', 'skipped');

        $this->assertTrue($this->admin->apply()['ok']);
    }

    public function testApplyMovesEveryStreamHidesTheFailuresAndWritesTheSnapshotOnce(): void
    {
        $rows = $this->scenario();

        $r = $this->admin->apply();

        $this->assertSame(['ok' => true, 'hidden' => 1, 'listed' => 2, 'snapshot' => true], $r);
        $states = array_map(fn (array $row): array => [$this->raw($row)['state'], $this->raw($row)['state_reason']], $rows);
        $this->assertSame([
            'good' => ['working', null],
            'dead' => ['dead', 'never_passed'],
            'nocors' => ['unplayable', 'no_cors'],
            'guarded' => ['new', null],
            'proven_ok' => ['working', null],
            'proven_bad' => ['suspect', null],
            'held' => ['dead', 'never_passed'],
        ], $states);
        $this->assertNotNull($this->state->appliedAt());
        $this->assertSame(1, $this->audits('checker.apply'));
        $detail = (string) $this->pdo->query("SELECT detail FROM admin_audit WHERE action = 'checker.apply'")->fetchColumn();
        $this->assertStringContainsString('hidden=1', $detail);
        $names = array_map(static fn (array $s): string => $s['n'], json_decode((string) file_get_contents($this->dir . '/streams.json'), true)['streams']);
        sort($names);
        $this->assertSame(['Stream 1', 'Stream 5'], $names, 'verified only: the two that passed are listed; the set-aside new one and the suspect one are not');
    }

    public function testApplyLeavesTheRecordedResultsAlone(): void
    {
        $row = $this->checked('1', 'unreachable');
        $this->checked('2', 'pass');
        $this->checked('3', 'pass');

        $this->admin->apply();

        $raw = $this->raw($row);
        $this->assertSame(['unreachable', 1234, self::RECENT], [$raw['check_result'], (int) $raw['check_bytes'], $raw['last_checked_at']]);
        $this->assertSame('2026-11-13 03:00:00', $raw['next_check_at'], 'but it is now due by the schedule of its new state');
        $this->assertSame('2026-11-12 03:00:00', $raw['state_changed_at']);
    }

    public function testApplyHidesAFailingPinnedOrDefaultStreamButKeepsThePinAndTheDefaultFlag(): void
    {
        $pinned = $this->checked('1', 'unreachable', ['pinned' => 1]);
        $default = $this->checked('2', 'unreachable', ['is_default' => 1]);
        $this->checked('3', 'pass');
        $this->checked('4', 'pass');

        $this->admin->apply();

        $this->assertSame(['dead', 1, 0], [$this->raw($pinned)['state'], (int) $this->raw($pinned)['pinned'], (int) $this->raw($pinned)['is_default']]);
        $this->assertSame(['dead', 0, 1], [$this->raw($default)['state'], (int) $this->raw($default)['pinned'], (int) $this->raw($default)['is_default']]);
        $snapshot = json_decode((string) file_get_contents($this->dir . '/streams.json'), true);
        $this->assertNull($snapshot['default'], 'with the default hidden the page falls back to its demo');
    }

    public function testASecondApplyChangesNothingAndSaysSo(): void
    {
        $this->scenario();
        $this->admin->apply();
        $before = $this->pdo->query('SELECT id, state, state_reason, next_check_at FROM streams ORDER BY id')->fetchAll();

        $r = $this->admin->apply();

        $this->assertTrue($r['ok']);
        $this->assertTrue($r['already']);
        $this->assertSame($before, $this->pdo->query('SELECT id, state, state_reason, next_check_at FROM streams ORDER BY id')->fetchAll());
        $this->assertSame(1, $this->audits('checker.apply'));
    }

    public function testAfterApplyTheModeIsLiveAndNothingWouldBeHidden(): void
    {
        $this->scenario();
        $this->admin->apply();

        $s = $this->admin->status();

        $this->assertSame('live', $s['mode']);
        $this->assertNotNull($s['applied_at']);
        $this->assertSame(0, $s['would_hide']);
    }

    // ---- pause

    public function testPauseAndResumeAreRecordedAndShownInTheStatus(): void
    {
        $this->assertSame(['ok' => true, 'paused' => true], $this->admin->setPaused(true));
        $this->assertTrue($this->admin->status()['paused']);
        $this->assertSame(1, $this->audits('checker.pause'));

        $this->assertSame(['ok' => true, 'paused' => false], $this->admin->setPaused(false));
        $this->assertFalse($this->admin->status()['paused']);
        $this->assertSame(1, $this->audits('checker.resume'));
    }
}
