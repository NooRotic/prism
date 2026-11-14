<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\UsageCounters;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;

final class UsageCountersTest extends DbTestCase
{
    public function testIncrementAddsToTodaysRow(): void
    {
        $counters = new UsageCounters($this->pdo, $this->clock);

        $counters->increment('hit:home');
        $counters->increment('hit:home');
        $counters->increment('hit:twitch');

        $this->assertSame(2, $counters->valueOn('2026-11-12', 'hit:home'));
        $this->assertSame(1, $counters->valueOn('2026-11-12', 'hit:twitch'));
        $this->assertSame(0, $counters->valueOn('2026-11-12', 'hit:other'));
        $this->assertSame(0, $counters->valueOn('2026-11-11', 'hit:home'));
    }

    public function testHitsAtMidnightLandOnDifferentDays(): void
    {
        $clock = FakeClock::at('2026-11-12T23:59:59Z');
        $counters = new UsageCounters($this->pdo, $clock);

        $counters->increment('hit:home');
        $clock->advanceMs(1000);
        $counters->increment('hit:home');

        $this->assertSame(1, $counters->valueOn('2026-11-12', 'hit:home'));
        $this->assertSame(1, $counters->valueOn('2026-11-13', 'hit:home'));
    }

    public function testForDaysIsZeroFilledAndOldestFirst(): void
    {
        $counters = new UsageCounters($this->pdo, $this->clock);
        $counters->increment('hit:home');
        $this->clock->advanceMs(-2 * 86_400_000);
        $counters->increment('hit:twitch');
        $counters->increment('hit:twitch');
        $this->clock->advanceMs(2 * 86_400_000);

        $days = $counters->forDays(4, ['hit:home', 'hit:twitch']);

        $this->assertSame(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'], array_keys($days));
        $this->assertSame(['hit:home' => 0, 'hit:twitch' => 0], $days['2026-11-09']);
        $this->assertSame(['hit:home' => 0, 'hit:twitch' => 2], $days['2026-11-10']);
        $this->assertSame(['hit:home' => 0, 'hit:twitch' => 0], $days['2026-11-11']);
        $this->assertSame(['hit:home' => 1, 'hit:twitch' => 0], $days['2026-11-12']);
    }
}
