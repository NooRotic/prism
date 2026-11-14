<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\AttemptStore;
use Prism\History\Tests\Support\DbTestCase;

final class AttemptStoreTest extends DbTestCase
{
    private const DAY_MS = 86_400_000;

    private AttemptStore $attempts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->attempts = new AttemptStore($this->pdo, $this->clock);
    }

    public function testFirstAttemptCreatesARowAndLaterOnesCount(): void
    {
        $this->attempts->record('7', 'someone', false);
        $this->clock->advanceMs(3_600_000);
        $this->attempts->record('7', 'someone', false);
        $this->attempts->record('8', 'other', false);

        $rows = $this->attempts->recent();

        $this->assertCount(2, $rows);
        $this->assertSame('8', $rows[0]['twitch_id'], 'newest first');
        $this->assertSame(
            ['twitch_id' => '7', 'login' => 'someone', 'first_attempt_at' => '2026-11-12 03:00:00', 'last_attempt_at' => '2026-11-12 04:00:00', 'attempts' => 2, 'via_script' => false],
            $rows[1],
        );
    }

    public function testLoginFollowsTheLatestAttempt(): void
    {
        $this->attempts->record('7', 'oldname', false);
        $this->attempts->record('7', 'newname', false);

        $this->assertSame('newname', $this->attempts->recent()[0]['login']);
    }

    public function testTheScriptFlagSticks(): void
    {
        $this->attempts->record('7', 'someone', true);
        $this->attempts->record('7', 'someone', false);

        $this->assertTrue($this->attempts->recent()[0]['via_script']);

        $this->attempts->record('8', 'other', false);
        $this->attempts->record('8', 'other', true);
        $row = array_values(array_filter($this->attempts->recent(), static fn (array $r): bool => $r['twitch_id'] === '8'))[0];
        $this->assertTrue($row['via_script']);
    }

    public function testRowsOlderThanNinetyDaysArePurged(): void
    {
        $this->attempts->record('7', 'old', false);
        $this->clock->advanceMs(89 * self::DAY_MS);
        $this->attempts->record('8', 'recent', false);
        $this->assertCount(2, $this->attempts->recent(), 'a 89 day old row is still kept');

        $this->clock->advanceMs(2 * self::DAY_MS);
        $this->attempts->record('9', 'newest', false);

        $this->assertSame(['9', '8'], array_column($this->attempts->recent(), 'twitch_id'));
    }

    public function testTheTableIsCappedAtOneThousandDroppingTheOldest(): void
    {
        for ($i = 1; $i <= 1001; $i++) {
            $this->attempts->record((string) $i, 'user' . $i, false);
            $this->clock->advanceMs(1000);
        }

        $ids = array_column($this->attempts->recent(), 'twitch_id');

        $this->assertCount(1000, $ids);
        $this->assertNotContains('1', $ids, 'the oldest row is the one dropped');
        $this->assertContains('1001', $ids);
    }

    public function testAnOddLoginIsStoredBlank(): void
    {
        $this->attempts->record('7', '<b>x</b>', false);
        $this->attempts->record('8', str_repeat('a', 26), false);
        $this->attempts->record('9', 'fine_name', false);

        $byId = array_column($this->attempts->recent(), 'login', 'twitch_id');
        ksort($byId); // recent() is newest first; the order is not what this test is about

        $this->assertSame([7 => '', 8 => '', 9 => 'fine_name'], $byId);
    }

    public function testCountSinceCountsRowsByLastAttempt(): void
    {
        $this->attempts->record('7', 'a', false);
        $this->clock->advanceMs(2 * self::DAY_MS);
        $this->attempts->record('8', 'b', false);

        $this->assertSame(1, $this->attempts->countSince('2026-11-13 00:00:00'));
        $this->assertSame(2, $this->attempts->countSince('2026-11-12 00:00:00'));
        $this->assertSame(0, $this->attempts->countSince('2026-11-15 00:00:00'));
    }
}
