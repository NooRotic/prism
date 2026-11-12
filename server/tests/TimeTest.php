<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Prism\History\Time;

final class TimeTest extends TestCase
{
    private function ms(string $iso): int
    {
        return ((int) (new DateTimeImmutable($iso))->format('U')) * 1000;
    }

    public function testDatetimeAndDateAreUtc(): void
    {
        $ms = $this->ms('2026-11-12T03:00:00Z');

        $this->assertSame('2026-11-12 03:00:00', Time::datetime($ms));
        $this->assertSame('2026-11-12', Time::date($ms));
    }

    public function testDateRollsAtUtcMidnight(): void
    {
        $this->assertSame('2026-11-12', Time::date($this->ms('2026-11-12T23:59:59Z') + 999));
        $this->assertSame('2026-11-13', Time::date($this->ms('2026-11-13T00:00:00Z')));
    }

    public function testParseDatetimeIsTheInverseOfDatetime(): void
    {
        $ms = $this->ms('2026-11-12T03:00:00Z');

        $this->assertSame($ms, Time::parseDatetime(Time::datetime($ms)));
    }

    public function testParseDatetimeRejectsNonsense(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Time::parseDatetime('not a date');
    }
}
