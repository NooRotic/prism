<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\RunLock;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;

final class RunLockTest extends DbTestCase
{
    public function testTheHolderOfTheLockKeepsItsConnectionOpenForHoursWhileItWaits(): void
    {
        // A launcher holds the lock on a connection that sends nothing while its workers run, for up to an hour. A host with a
        // short wait_timeout would drop that connection and silently free the lock.
        $this->pdo->exec('SET SESSION wait_timeout = 30');
        $lock = new RunLock($this->pdo, 'prism_test_lock_timeout');

        $this->assertTrue($lock->acquire());

        $this->assertGreaterThanOrEqual(28_800, (int) $this->pdo->query('SELECT @@SESSION.wait_timeout')->fetchColumn());
        $lock->release();
    }

    public function testTheLockIsOneAtATimeAcrossConnectionsAndIsFreedOnRelease(): void
    {
        $other = Database::pdo();
        $first = new RunLock($this->pdo, 'prism_test_lock_one');
        $second = new RunLock($other, 'prism_test_lock_one');

        $this->assertTrue($first->acquire());
        $this->assertFalse($second->acquire(), 'a second connection does not get it');
        $first->release();
        $this->assertTrue($second->acquire(), 'and does once it is released');
        $second->release();
    }
}
