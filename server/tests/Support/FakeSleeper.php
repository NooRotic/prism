<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Tracker\Sleeper;

/** Sleeps by moving the fake clock forward, and remembers how long it was asked to sleep. */
final class FakeSleeper implements Sleeper
{
    public int $totalMs = 0;

    /** @var list<int> */
    public array $calls = [];

    /** @var (callable(int):void)|null runs while "sleeping", to stand in for another process acting in the meantime */
    public $onSleep = null;

    public function __construct(private FakeClock $clock)
    {
    }

    public function sleepMs(int $ms): void
    {
        $this->calls[] = $ms;
        $this->totalMs += $ms;
        $this->clock->advanceMs($ms);
        if ($this->onSleep !== null) {
            ($this->onSleep)($ms);
        }
    }
}
