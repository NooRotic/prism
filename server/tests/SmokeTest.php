<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use PHPUnit\Framework\TestCase;

final class SmokeTest extends TestCase
{
    public function testRunsOnPhp84(): void
    {
        $this->assertGreaterThanOrEqual(80400, PHP_VERSION_ID);
    }

    public function testDatabaseIsMariaDb1011(): void
    {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            getenv('TEST_DB_HOST'),
            getenv('TEST_DB_NAME'),
        );
        $pdo = new PDO($dsn, (string) getenv('TEST_DB_USER'), (string) getenv('TEST_DB_PASS'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();

        $this->assertStringStartsWith('10.11', $version);
        $this->assertStringContainsString('MariaDB', $version);
    }
}
