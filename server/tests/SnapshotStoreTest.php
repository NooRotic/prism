<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Time;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\Fixtures;

final class SnapshotStoreTest extends DbTestCase
{
    private SnapshotStore $snapshots;

    protected function setUp(): void
    {
        parent::setUp();
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
        (new ChannelStore($this->pdo, $this->clock))->insertTracked(Fixtures::user('1', 'alice'), null);
    }

    public function testUpsertWritesOneRowPerDate(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');

        $this->assertSame('2', (string) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn());
    }

    public function testUpsertSameDateReplaces(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', ['rank' => 500], 'ok');
        $this->clock->advanceMs(3_600_000);
        $this->snapshots->upsert('1', '2026-11-12', ['rank' => 400], 'ok');

        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn());
        $row = $this->snapshots->latest('1');
        $this->assertSame(400, $row['rank']);
        $this->assertSame('2026-11-12 04:00:00', $row['fetched_at']);
    }

    public function testRowKeysUseRankAndFollowersChange(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');

        $this->assertSame(
            ['date', 'rank', 'minutes_streamed', 'avg_viewers', 'max_viewers', 'hours_watched', 'followers_change', 'followers_total', 'tt_status', 'fetched_at'],
            array_keys($this->snapshots->latest('1')),
        );
    }

    public function testNegativeChangeNullsAndLargeNumbersRoundTrip(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', [
            'rank' => 217,
            'minutes_streamed' => 5658,
            'avg_viewers' => 7372,
            'max_viewers' => null,
            'hours_watched' => 5_000_000_000,
            'followers' => -3745,
            'followers_total' => 11292376,
        ], 'ok');

        $row = $this->snapshots->latest('1');

        $this->assertSame('2026-11-12', $row['date']);
        $this->assertSame(217, $row['rank']);
        $this->assertSame(5658, $row['minutes_streamed']);
        $this->assertSame(7372, $row['avg_viewers']);
        $this->assertNull($row['max_viewers']);
        $this->assertSame(5_000_000_000, $row['hours_watched']);
        $this->assertSame(-3745, $row['followers_change']);
        $this->assertSame(11292376, $row['followers_total']);
        $this->assertSame('ok', $row['tt_status']);
    }

    public function testAnEmptySummaryStoresNullsNotZeros(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', [], 'untracked');

        $row = $this->snapshots->latest('1');

        foreach (['rank', 'minutes_streamed', 'avg_viewers', 'max_viewers', 'hours_watched', 'followers_change', 'followers_total'] as $key) {
            $this->assertNull($row[$key], $key);
        }
        $this->assertSame('untracked', $row['tt_status']);
    }

    public function testHistoryIsOldestFirstAndLimitedByDays(): void
    {
        foreach (['2026-11-12', '2026-11-11', '2026-11-07'] as $date) {
            $this->snapshots->upsert('1', $date, ['rank' => (int) substr($date, -2)], 'ok');
        }

        $this->assertSame(['2026-11-11', '2026-11-12'], array_column($this->snapshots->history('1', 3), 'date'));
        $this->assertSame(['2026-11-07', '2026-11-11', '2026-11-12'], array_column($this->snapshots->history('1', null), 'date'));
        $this->assertSame(['2026-11-11', '2026-11-12'], array_column($this->snapshots->history('1', 1), 'date'));
        $this->assertSame([], $this->snapshots->history('999', 90));
    }

    /**
     * Growth over N days compares today with the row dated N days earlier, so a window of N days must reach
     * back to that date: N days before today is inside it, N + 1 days before is not.
     */
    public function testHistoryWindowReachesBackExactlyNDaysBeforeToday(): void
    {
        foreach (['2026-11-12', '2026-11-09', '2026-11-08'] as $date) {
            $this->snapshots->upsert('1', $date, ['rank' => 5], 'ok');
        }

        $this->assertSame(['2026-11-09', '2026-11-12'], array_column($this->snapshots->history('1', 3), 'date'));
    }

    public function testHasOkForIgnoresErrorAndUntrackedRows(): void
    {
        $this->snapshots->upsert('1', '2026-11-10', [], 'error');
        $this->snapshots->upsert('1', '2026-11-11', [], 'untracked');
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');

        $this->assertFalse($this->snapshots->hasOkFor('1', '2026-11-10'));
        $this->assertFalse($this->snapshots->hasOkFor('1', '2026-11-11'));
        $this->assertTrue($this->snapshots->hasOkFor('1', '2026-11-12'));
        $this->assertFalse($this->snapshots->hasOkFor('1', '2026-11-13'));
    }

    public function testLatestAndLatestNonError(): void
    {
        $this->assertNull($this->snapshots->latest('1'));
        $this->assertNull($this->snapshots->latestNonError('1'));

        $this->snapshots->upsert('1', '2026-11-10', Fixtures::summary(), 'ok');
        $this->snapshots->upsert('1', '2026-11-12', [], 'error');

        $this->assertSame('2026-11-12', $this->snapshots->latest('1')['date']);
        $this->assertSame('2026-11-10', $this->snapshots->latestNonError('1')['date']);
    }

    public function testSnapshotDateComesFromTheUtcClock(): void
    {
        $this->clock->set(FakeClock::at('2026-11-12T23:59:59Z')->nowMs());
        $this->snapshots->upsert('1', Time::date($this->clock->nowMs()), ['rank' => 1], 'ok');
        $this->clock->advanceMs(2000);
        $this->snapshots->upsert('1', Time::date($this->clock->nowMs()), ['rank' => 2], 'ok');

        $rows = $this->snapshots->history('1', null);

        $this->assertSame(['2026-11-12', '2026-11-13'], array_column($rows, 'date'));
        $this->assertSame(['2026-11-12 23:59:59', '2026-11-13 00:00:01'], array_column($rows, 'fetched_at'));
    }
}
