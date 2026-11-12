<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\JobState;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tracker\TtGate;

final class TtGateTest extends DbTestCase
{
    private JobState $state;
    private FakeSleeper $sleeper;

    protected function setUp(): void
    {
        parent::setUp();
        $this->state = new JobState($this->pdo, $this->clock);
        $this->sleeper = new FakeSleeper($this->clock);
    }

    private function gate(int $gap = 1500, int $run = 300, int $day = 1500, int $maxWait = 3000): TtGate
    {
        return new TtGate($this->pdo, $this->clock, $this->sleeper, $this->state, $gap, $run, $day, $maxWait);
    }

    private function dayCount(): ?string
    {
        return $this->state->get('tt_calls:2026-11-12');
    }

    public function testFirstCallPassesImmediately(): void
    {
        $this->assertTrue($this->gate()->acquire(false));
        $this->assertSame(0, $this->sleeper->totalMs);
        $this->assertSame('1', $this->dayCount());
    }

    public function testSecondCallWaitsForTheGap(): void
    {
        $gate = $this->gate();

        $this->assertTrue($gate->acquire(false));
        $this->assertTrue($gate->acquire(false));

        $this->assertGreaterThanOrEqual(1500, $this->sleeper->totalMs);
        $this->assertSame('2', $this->dayCount());
    }

    public function testGivesUpWhenTheTurnIsFurtherAwayThanMaxWait(): void
    {
        $gate = $this->gate(1500, 300, 1500, 1000);

        $this->assertTrue($gate->acquire(false));
        $this->assertFalse($gate->acquire(false));

        $this->assertSame('1', $this->dayCount());
        $this->assertSame(0, $this->sleeper->totalMs);
    }

    public function testRunBudgetStopsScheduledRunCallsButNotVisits(): void
    {
        $gate = $this->gate(1500, 2, 100);

        $this->assertTrue($gate->acquire(true));
        $this->assertTrue($gate->acquire(true));
        $this->assertFalse($gate->acquire(true));
        $this->assertTrue($gate->acquire(false));
    }

    public function testResetRunStartsANewRunBudget(): void
    {
        $gate = $this->gate(1500, 1, 100);

        $this->assertTrue($gate->acquire(true));
        $this->assertFalse($gate->acquire(true));
        $gate->resetRun();

        $this->assertTrue($gate->acquire(true));
    }

    public function testDayBudgetStopsEveryCall(): void
    {
        $gate = $this->gate(1500, 300, 2);

        $this->assertTrue($gate->acquire(false));
        $this->assertTrue($gate->acquire(false));

        $this->assertFalse($gate->acquire(false));
        $this->assertFalse($gate->acquire(true));
    }

    public function testDayBudgetStartsOverAtUtcMidnight(): void
    {
        $this->clock->set(FakeClock::at('2026-11-12T23:59:59Z')->nowMs());
        $gate = $this->gate(1500, 300, 1);

        $this->assertTrue($gate->acquire(false));
        $this->assertFalse($gate->acquire(false));

        $this->clock->set(FakeClock::at('2026-11-13T00:00:30Z')->nowMs());

        $this->assertTrue($gate->acquire(false));
        $this->assertSame('1', $this->state->get('tt_calls:2026-11-13'));
    }

    public function testPauseBlocksUntilNextUtcMidnight(): void
    {
        $gate = $this->gate();
        $gate->pauseForRestOfDay(null);

        $this->assertFalse($gate->acquire(false));

        $this->clock->set(FakeClock::at('2026-11-12T23:59:59Z')->nowMs());
        $this->assertFalse($gate->acquire(false));

        $this->clock->set(FakeClock::at('2026-11-13T00:00:00Z')->nowMs());
        $this->assertTrue($gate->acquire(false));
    }

    public function testARetryAfterShorterThanTheRestOfTheDayStillPausesToMidnight(): void
    {
        $gate = $this->gate();
        $gate->pauseForRestOfDay(60);

        $this->clock->set(FakeClock::at('2026-11-12T03:10:00Z')->nowMs());

        $this->assertFalse($gate->acquire(false));
    }

    public function testPauseHonoursRetryAfterWhenLonger(): void
    {
        $gate = $this->gate();
        $gate->pauseForRestOfDay(2 * 86400);

        $this->clock->set(FakeClock::at('2026-11-14T02:59:59Z')->nowMs());
        $this->assertFalse($gate->acquire(false));

        $this->clock->set(FakeClock::at('2026-11-14T03:00:00Z')->nowMs());
        $this->assertTrue($gate->acquire(false));
    }

    public function testAShorterPauseNeverCutsALongerOneShort(): void
    {
        $gate = $this->gate();
        $gate->pauseForRestOfDay(2 * 86400);
        $gate->pauseForRestOfDay(null);

        $this->clock->set(FakeClock::at('2026-11-13T12:00:00Z')->nowMs());

        $this->assertFalse($gate->acquire(false));
    }

    public function testTwoGateInstancesOnOneDatabaseShareTheGap(): void
    {
        $first = $this->gate();
        $second = $this->gate();

        $this->assertTrue($first->acquire(false));
        $this->assertTrue($second->acquire(false));

        $this->assertGreaterThanOrEqual(1500, $this->sleeper->totalMs);
        $this->assertSame('2', $this->dayCount());
    }
}
