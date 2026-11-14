<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\RateCap;
use Prism\History\Store\JobState;
use Prism\History\Tests\Support\DbTestCase;

final class RateCapTest extends DbTestCase
{
    public function testAllowsUpToTheLimitThenRefuses(): void
    {
        $cap = new RateCap(new JobState($this->pdo, $this->clock), $this->clock);

        $this->assertTrue($cap->allow('hit', 2));
        $this->assertTrue($cap->allow('hit', 2));
        $this->assertFalse($cap->allow('hit', 2));
        $this->assertFalse($cap->allow('hit', 2));
        $this->assertTrue($cap->allow('signed-out', 2), 'a different name has its own count');
    }

    public function testANewMinuteStartsAgainAndPrunesOldMinutes(): void
    {
        $state = new JobState($this->pdo, $this->clock);
        $cap = new RateCap($state, $this->clock);
        $this->assertTrue($cap->allow('hit', 1));
        $this->assertFalse($cap->allow('hit', 1));
        $this->assertTrue($cap->allow('other', 1));

        $this->clock->advanceMs(60_000);

        $this->assertTrue($cap->allow('hit', 1));
        $keys = array_keys($state->getByPrefix('cap:'));
        $this->assertSame(['cap:hit:202611120301', 'cap:other:202611120300'], $keys);
    }

    public function testPruneBeforeDeletesOnlyOlderKeysWithThePrefix(): void
    {
        $state = new JobState($this->pdo, $this->clock);
        foreach (['a:1', 'a:2', 'a:3', 'ab:1', 'b:1'] as $key) {
            $state->set($key, '1');
        }

        $state->pruneBefore('a:', 'a:3');

        $this->assertSame(['a:3', 'ab:1', 'b:1'], array_keys($state->getByPrefix('')));
    }
}
