<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use DateTimeImmutable;
use Prism\History\Clock;

/** A clock the test moves by hand. */
final class FakeClock implements Clock
{
    public function __construct(private int $ms)
    {
    }

    /** A clock at an ISO instant, for example FakeClock::at('2026-11-12T03:00:00Z'). */
    public static function at(string $iso): self
    {
        return new self(((int) (new DateTimeImmutable($iso))->format('U')) * 1000);
    }

    public function nowMs(): int
    {
        return $this->ms;
    }

    public function set(int $ms): void
    {
        $this->ms = $ms;
    }

    public function advanceMs(int $ms): void
    {
        $this->ms += $ms;
    }
}
