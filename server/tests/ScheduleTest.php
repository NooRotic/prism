<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Checker\Schedule;

final class ScheduleTest extends TestCase
{
    /** @return array<string,array{0:string,1:?string,2:?int}> */
    public static function intervals(): array
    {
        return [
            'new' => ['new', null, 0],
            'held awaiting check' => ['held', 'awaiting_check', 0],
            'working' => ['working', null, 86_400],
            'suspect' => ['suspect', null, 21_600],
            'dead never passed' => ['dead', 'never_passed', 86_400],
            'dead failed 3 days' => ['dead', 'failed_3_days', 172_800],
            'dead with no reason is treated like failed 3 days' => ['dead', null, 172_800],
            'unplayable no cors' => ['unplayable', 'no_cors', 604_800],
            'removed by the checker' => ['removed', 'dead_14_days', 2_592_000],
            'unplayable http' => ['unplayable', 'http', null],
            'held port' => ['held', 'port', null],
            'removed by the owner' => ['removed', null, null],
            'removed with another reason' => ['removed', 'owner', null],
        ];
    }

    #[DataProvider('intervals')]
    public function testTheTimingTable(string $state, ?string $reason, ?int $seconds): void
    {
        $this->assertSame($seconds, Schedule::intervalSeconds($state, $reason));
    }

    public function testAWorkingStreamIsDueExactlyADayLater(): void
    {
        $now = strtotime('2026-11-15 12:00:00 UTC') * 1000;

        $this->assertSame('2026-11-16 12:00:00', Schedule::nextCheckAt('working', null, $now));
        $this->assertSame('2026-11-15 18:00:00', Schedule::nextCheckAt('suspect', null, $now));
        $this->assertSame('2026-12-15 12:00:00', Schedule::nextCheckAt('removed', 'dead_14_days', $now));
    }

    public function testANewStreamIsDueAtOnceAndANeverCheckedStateHasNoDate(): void
    {
        $now = strtotime('2026-11-15 12:00:00 UTC') * 1000;

        $this->assertSame('2026-11-15 12:00:00', Schedule::nextCheckAt('new', null, $now));
        $this->assertNull(Schedule::nextCheckAt('unplayable', 'http', $now));
        $this->assertNull(Schedule::nextCheckAt('removed', null, $now));
    }
}
