<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use PDO;
use PHPUnit\Framework\TestCase;
use Prism\History\Migrator;

/** Base for tests that need the real schema on a clean database and a clock fixed at 2026-11-12T03:00:00Z. */
abstract class DbTestCase extends TestCase
{
    protected PDO $pdo;
    protected FakeClock $clock;

    protected function setUp(): void
    {
        $this->clock = FakeClock::at('2026-11-12T03:00:00Z');
        $this->pdo = Database::pdo();
        Database::dropAll($this->pdo);
        (new Migrator($this->pdo, __DIR__ . '/../../migrations'))->run();
    }
}
