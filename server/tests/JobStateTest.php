<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\JobState;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;

final class JobStateTest extends DbTestCase
{
    private JobState $state;

    protected function setUp(): void
    {
        parent::setUp();
        $this->state = new JobState($this->pdo, $this->clock);
    }

    public function testGetMissingReturnsNull(): void
    {
        $this->assertNull($this->state->get('nothing'));
    }

    public function testSetOverwrites(): void
    {
        $this->state->set('a', '1');
        $this->state->set('a', '2');

        $this->assertSame('2', $this->state->get('a'));
    }

    public function testSetStampsUpdatedAtInUtc(): void
    {
        $this->state->set('a', '1');

        $this->assertSame(
            '2026-11-12 03:00:00',
            $this->pdo->query("SELECT updated_at FROM job_state WHERE k = 'a'")->fetchColumn(),
        );
    }

    public function testIncrStartsAtOneAndCounts(): void
    {
        $this->assertSame(1, $this->state->incr('n'));
        $this->assertSame(2, $this->state->incr('n'));
        $this->assertSame('2', $this->state->get('n'));
    }

    public function testIncrIsAtomicAcrossTwoInstances(): void
    {
        $other = new JobState(Database::pdo(), $this->clock);

        $seen = [
            $this->state->incr('n'),
            $other->incr('n'),
            $this->state->incr('n'),
            $other->incr('n'),
        ];

        $this->assertSame([1, 2, 3, 4], $seen);
        $this->assertSame('4', $this->state->get('n'));
    }

    public function testDeleteRemovesTheKey(): void
    {
        $this->state->set('a', '1');
        $this->state->delete('a');

        $this->assertNull($this->state->get('a'));
    }
}
