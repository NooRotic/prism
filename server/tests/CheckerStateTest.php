<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Checker\CheckerState;
use Prism\History\RunLock;
use Prism\History\Store\JobState;
use Prism\History\Tests\Support\DbTestCase;

final class CheckerStateTest extends DbTestCase
{
    private const MB = 1_048_576;

    private CheckerState $state;
    private JobState $jobs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->jobs = new JobState($this->pdo, $this->clock);
        $this->state = new CheckerState($this->jobs, $this->clock);
    }

    public function testItsLockNameIsItsOwn(): void
    {
        $this->assertSame('prism_playlist_check', RunLock::CHECKER);
        $this->assertNotSame(RunLock::CHECKER, RunLock::NAME);
        $this->assertNotSame(RunLock::CHECKER, RunLock::LOGOS);
    }

    public function testAFreshStateIsNotAppliedNotPausedAndHasReadNothing(): void
    {
        $this->assertNull($this->state->appliedAt());
        $this->assertFalse($this->state->isPaused());
        $this->assertSame(0, $this->state->bytesToday());
        $this->assertSame(0, $this->state->firstPassBytes());
        $this->assertNull($this->state->lastStop());
    }

    public function testMarkAppliedStoresTheInstant(): void
    {
        $this->state->markApplied();

        $this->assertSame('2026-11-12 03:00:00', $this->state->appliedAt());
    }

    public function testThePauseSwitchRoundTrips(): void
    {
        $this->state->setPaused(true);
        $this->assertTrue($this->state->isPaused());

        $this->state->setPaused(false);
        $this->assertFalse($this->state->isPaused());
    }

    public function testBytesAccumulateForTheUtcDayAndStartOverAtMidnight(): void
    {
        $this->state->addBytes(1000);
        $this->state->addBytes(500);
        $this->assertSame(1500, $this->state->bytesToday());

        $this->clock->advanceMs(21 * 3_600_000); // 2026-11-13 00:00:00 UTC
        $this->assertSame(0, $this->state->bytesToday());
        $this->state->addBytes(7);
        $this->assertSame(7, $this->state->bytesToday());
    }

    public function testBeforeApplyBytesAlsoCountTowardTheFirstPassTotalAndAfterApplyTheyDoNot(): void
    {
        $this->state->addBytes(1000);
        $this->state->addBytes(24);
        $this->assertSame(1024, $this->state->firstPassBytes());

        $this->state->markApplied();
        $this->state->addBytes(5000);

        $this->assertSame(1024, $this->state->firstPassBytes(), 'the first-pass total stops at Apply');
        $this->assertSame(6024, $this->state->bytesToday());
    }

    public function testBeforeApplyTheFirstPassCapDecidesAndAfterApplyTheDailyCapDoes(): void
    {
        $this->state->addBytes(3 * self::MB);

        $this->assertFalse($this->state->capReached(1024 * self::MB, 4 * self::MB));
        $this->assertTrue($this->state->capReached(1024 * self::MB, 3 * self::MB), 'the cap is reached when the total equals it');
        $this->assertFalse($this->state->capReached(2 * self::MB, 4 * self::MB), 'the daily cap does not matter before Apply');

        $this->state->markApplied();

        $this->assertTrue($this->state->capReached(2 * self::MB, 4 * self::MB), 'after Apply today counts against the daily cap');
        $this->assertFalse($this->state->capReached(4 * self::MB, 1));
    }

    public function testTheDailyCapIsFreshEachUtcDay(): void
    {
        $this->state->markApplied();
        $this->state->addBytes(2 * self::MB);
        $this->assertTrue($this->state->capReached(2 * self::MB, 1));

        $this->clock->advanceMs(24 * 3_600_000);

        $this->assertFalse($this->state->capReached(2 * self::MB, 1));
    }

    public function testOldDaysAreDroppedWhenANewDayStarts(): void
    {
        $this->state->markApplied();
        $this->state->addBytes(10);
        $this->clock->advanceMs(30 * 86_400_000);

        $this->state->addBytes(20);

        $keys = array_keys($this->jobs->getByPrefix('checker_bytes_'));
        $this->assertSame(['checker_bytes_20261212'], $keys, 'only the current day is kept (and no first-pass key after Apply)');
    }

    public function testAStopIsRecordedWithItsReasonAndTime(): void
    {
        $this->state->recordStop('run_guard');

        $this->assertSame(['reason' => 'run_guard', 'at' => '2026-11-12 03:00:00'], $this->state->lastStop());
    }
}
