<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\HostPacer;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\FakeSleeper;

final class HostPacerTest extends TestCase
{
    private FakeClock $clock;
    private FakeSleeper $sleeper;
    private HostPacer $pacer;

    protected function setUp(): void
    {
        $this->clock = FakeClock::at('2026-11-15T00:00:00Z');
        $this->sleeper = new FakeSleeper($this->clock);
        $this->pacer = new HostPacer($this->sleeper, $this->clock);
    }

    public function testTheFirstRequestToAHostWaitsForNothing(): void
    {
        $this->pacer->wait('https://a.test/x.m3u8');

        $this->assertSame([], $this->sleeper->calls);
    }

    public function testASecondRequestRightAfterWaitsAFullSecond(): void
    {
        $this->pacer->wait('https://a.test/x.m3u8');
        $this->pacer->wait('https://a.test/seg.ts');

        $this->assertSame([1000], $this->sleeper->calls);
    }

    public function testOnlyTheRestOfTheSecondIsWaited(): void
    {
        $this->pacer->wait('https://a.test/x.m3u8');
        $this->clock->advanceMs(400);
        $this->pacer->wait('https://a.test/seg.ts');

        $this->assertSame([600], $this->sleeper->calls);
    }

    public function testAfterASecondThereIsNoWait(): void
    {
        $this->pacer->wait('https://a.test/x.m3u8');
        $this->clock->advanceMs(1000);
        $this->pacer->wait('https://a.test/seg.ts');

        $this->assertSame([], $this->sleeper->calls);
    }

    public function testTheSecondIsCountedFromTheStartOfTheLastRequestAfterItsWait(): void
    {
        $this->pacer->wait('https://a.test/1');
        $this->pacer->wait('https://a.test/2');
        $this->pacer->wait('https://a.test/3');

        $this->assertSame([1000, 1000], $this->sleeper->calls, 'one request a second, not a burst after the first wait');
    }

    public function testHostsAreIndependentAndCaseDoesNotMatter(): void
    {
        $this->pacer->wait('https://a.test/1');
        $this->pacer->wait('https://b.test/1');
        $this->assertSame([], $this->sleeper->calls);

        $this->pacer->wait('https://A.TEST/2');
        $this->assertSame([1000], $this->sleeper->calls);
    }

    public function testAResetForgetsEveryHost(): void
    {
        $this->pacer->wait('https://a.test/1');
        $this->pacer->reset();
        $this->pacer->wait('https://a.test/2');

        $this->assertSame([], $this->sleeper->calls);
    }

    public function testAnAddressWithNoHostIsNotWaitedFor(): void
    {
        $this->pacer->wait('not an address');
        $this->pacer->wait('not an address');

        $this->assertSame([], $this->sleeper->calls);
    }

    public function testTheGapCanBeChosen(): void
    {
        $pacer = new HostPacer($this->sleeper, $this->clock, 250);

        $pacer->wait('https://a.test/1');
        $pacer->wait('https://a.test/2');

        $this->assertSame([250], $this->sleeper->calls);
    }
}
