<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\RunGuard;

/**
 * The run guard asks "is the checker's own network down?", so it takes ONE vote per host: a big host that is down is one
 * piece of evidence, not fifty. Many different hosts failing to answer at the same time is the sign of a network problem.
 */
final class RunGuardTest extends TestCase
{
    /** Distinct hosts $from to $to-1, the first $failures of them voting "did not answer". */
    private static function hosts(RunGuard $guard, int $from, int $to, int $failures, string $prefix = 'host'): void
    {
        for ($i = $from; $i < $to; $i++) {
            $guard->record($prefix . $i . '.test', $i - $from < $failures, 'id-' . $prefix . $i);
        }
    }

    public function testItDoesNotTripBeforeTheWindowHoldsFiftyHosts(): void
    {
        $guard = new RunGuard();

        self::hosts($guard, 0, 49, 49);

        $this->assertFalse($guard->tripped());
        $this->assertSame([], $guard->voters());
    }

    public function testFiftyDifferentHostsAllFailingTripIt(): void
    {
        $guard = new RunGuard();

        self::hosts($guard, 0, 50, 50);

        $this->assertTrue($guard->tripped());
        $this->assertCount(50, $guard->voters(), 'the streams that voted are the ones to void');
        $this->assertSame('id-host0', $guard->voters()[0]);
    }

    public function testTwoThirdsOfTheHostsIsTheLine(): void
    {
        $under = new RunGuard();
        self::hosts($under, 0, 50, 33);
        $over = new RunGuard();
        self::hosts($over, 0, 50, 34);

        $this->assertFalse($under->tripped(), '33 of 50 hosts is under two thirds');
        $this->assertTrue($over->tripped(), '34 of 50 hosts is over two thirds');
    }

    public function testOneHostThatIsDownIsOneVoteHoweverManyOfItsStreamsFail(): void
    {
        $guard = new RunGuard();

        for ($i = 0; $i < 500; $i++) {
            $guard->record('big.test', true, 'stream-' . $i);
        }
        self::hosts($guard, 0, 20, 0);

        $this->assertFalse($guard->tripped());
        self::hosts($guard, 20, 60, 0, 'ok');
        $this->assertFalse($guard->tripped(), 'one failing host among fifty is nowhere near two thirds');
    }

    public function testAHostsNewestAnswerReplacesItsEarlierOne(): void
    {
        $guard = new RunGuard();
        self::hosts($guard, 0, 50, 34);
        $this->assertTrue($guard->tripped());

        $guard->record('host0.test', false, 'id-again'); // host0 answers this time

        $this->assertFalse($guard->tripped(), 'the same host now counts as an answer: 33 of 50');
        $this->assertCount(50, $guard->voters());
    }

    public function testTheWindowRollsOverDistinctHosts(): void
    {
        $guard = new RunGuard();
        self::hosts($guard, 0, 50, 50);
        $this->assertTrue($guard->tripped());

        self::hosts($guard, 50, 100, 0);

        $this->assertFalse($guard->tripped(), 'fifty answering hosts pushed the failing ones out');
        $this->assertSame('id-host50', $guard->voters()[0]);
    }

    public function testAUsualDayWithAThirdOfHostsNotAnsweringNeverTrips(): void
    {
        $guard = new RunGuard();

        for ($i = 0; $i < 600; $i++) {
            $guard->record('h' . $i . '.test', $i % 3 === 0, 'id' . $i);
            $this->assertFalse($guard->tripped());
        }
    }

    public function testHostNamesThatLookLikeNumbersDoNotBreakTheWindow(): void
    {
        $guard = new RunGuard();

        for ($i = 0; $i < 80; $i++) {
            $guard->record((string) (1000 + $i), true, 'id' . $i);
        }

        $this->assertTrue($guard->tripped());
        $this->assertCount(50, $guard->voters());
        $this->assertSame('id30', $guard->voters()[0], 'the oldest 30 were pushed out, in order');
    }

    public function testTheWindowAndTheThresholdCanBeChosen(): void
    {
        $guard = new RunGuard(6, 0.5);

        self::hosts($guard, 0, 6, 2);
        $this->assertFalse($guard->tripped());

        $guard->record('late.test', true, 'late');
        $guard->record('later.test', true, 'later'); // host0 and host1 (failed) are pushed out
        $this->assertFalse($guard->tripped(), 'host2..5 answered, late and later did not: 2 of 6');
        $guard->record('latest.test', true, 'latest');
        $this->assertTrue($guard->tripped(), '3 of 6 is the line of one half');
    }
}
