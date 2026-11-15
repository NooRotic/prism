<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\RunGuard;

final class RunGuardTest extends TestCase
{
    private static function feed(RunGuard $guard, int $failures, int $passes): void
    {
        for ($i = 0; $i < $failures; $i++) {
            $guard->record(true);
        }
        for ($i = 0; $i < $passes; $i++) {
            $guard->record(false);
        }
    }

    public function testItDoesNotTripBeforeTheWindowIsFull(): void
    {
        $guard = new RunGuard();

        self::feed($guard, 49, 0);

        $this->assertFalse($guard->tripped());
        $this->assertSame(0, $guard->lastResults());
    }

    public function testFiftyFailuresTripIt(): void
    {
        $guard = new RunGuard();

        self::feed($guard, 50, 0);

        $this->assertTrue($guard->tripped());
        $this->assertSame(50, $guard->lastResults(), 'the whole window is to be voided');
    }

    public function testTwoThirdsIsTheLine(): void
    {
        $under = new RunGuard();
        self::feed($under, 33, 17);
        $over = new RunGuard();
        self::feed($over, 34, 16);

        $this->assertFalse($under->tripped(), '33 of 50 is under two thirds');
        $this->assertTrue($over->tripped(), '34 of 50 is over two thirds');
    }

    public function testAUsualDayOfAThirdFailingNeverTrips(): void
    {
        $guard = new RunGuard();

        for ($i = 0; $i < 600; $i++) {
            $guard->record($i % 3 === 0);
            $this->assertFalse($guard->tripped());
        }
    }

    public function testTheWindowRolls(): void
    {
        $guard = new RunGuard();
        self::feed($guard, 50, 0);
        $this->assertTrue($guard->tripped());

        self::feed($guard, 0, 50);

        $this->assertFalse($guard->tripped(), 'fifty passes pushed the failures out of the window');
    }

    public function testTheWindowAndTheThresholdCanBeChosen(): void
    {
        $guard = new RunGuard(6, 0.5);

        self::feed($guard, 2, 4);
        $this->assertFalse($guard->tripped());

        // Three more failures push the two old ones out of the window one by one: it ends as pass, pass, pass, fail, fail, fail.
        self::feed($guard, 2, 0);
        $this->assertFalse($guard->tripped(), 'two of six after two more');
        self::feed($guard, 1, 0);
        $this->assertTrue($guard->tripped(), 'three of six is exactly the line of one half');
        $this->assertSame(6, $guard->lastResults());
    }
}
