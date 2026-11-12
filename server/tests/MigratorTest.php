<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;
use Prism\History\Migrator;
use Prism\History\Tests\Support\Database;

final class MigratorTest extends TestCase
{
    private PDO $pdo;
    private string $dir;

    protected function setUp(): void
    {
        $this->pdo = Database::pdo();
        Database::dropAll($this->pdo);
        $this->dir = sys_get_temp_dir() . '/prism-migrations-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->dir);
    }

    private function migration(string $name, string $sql): void
    {
        file_put_contents($this->dir . '/' . $name, $sql);
    }

    /** @return list<string> */
    private function recorded(): array
    {
        return $this->pdo->query('SELECT version FROM schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);
    }

    public function testAppliesPendingMigrationsInOrderOnce(): void
    {
        $this->migration('002_b.sql', 'CREATE TABLE b (id INT NOT NULL);');
        $this->migration('001_a.sql', 'CREATE TABLE a (id INT NOT NULL);');

        $applied = (new Migrator($this->pdo, $this->dir))->run();

        $this->assertSame(['001_a', '002_b'], $applied);
        $this->assertSame(['001_a', '002_b'], $this->recorded());
        $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertContains('a', $tables);
        $this->assertContains('b', $tables);
    }

    public function testSecondRunAppliesNothing(): void
    {
        $this->migration('001_a.sql', 'CREATE TABLE a (id INT NOT NULL);');
        $migrator = new Migrator($this->pdo, $this->dir);

        $migrator->run();

        $this->assertSame([], $migrator->run());
        $this->assertSame(['001_a'], $this->recorded());
    }

    public function testAFileWithSeveralStatementsAndCommentsRunsEveryStatement(): void
    {
        $this->migration(
            '001_many.sql',
            "-- first table\nCREATE TABLE a (id INT NOT NULL);\n\n-- second table\nCREATE TABLE b (id INT NOT NULL);\nINSERT INTO a (id) VALUES (7);\n",
        );

        (new Migrator($this->pdo, $this->dir))->run();

        $this->assertSame('7', (string) $this->pdo->query('SELECT id FROM a')->fetchColumn());
        $this->assertContains('b', $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN));
    }

    public function testALaterBrokenStatementInAFileIsNotSwallowed(): void
    {
        $this->migration('001_half.sql', "CREATE TABLE a (id INT NOT NULL);\nCREATE TABL oops;\n");

        try {
            (new Migrator($this->pdo, $this->dir))->run();
            $this->fail('A broken second statement must fail the migration');
        } catch (PDOException) {
            $this->assertSame([], $this->recorded());
        }
    }

    public function testFailedMigrationIsNotRecorded(): void
    {
        $this->migration('001_ok.sql', 'CREATE TABLE ok_table (id INT NOT NULL);');
        $this->migration('002_bad.sql', 'CREATE TABL not_valid_sql;');

        try {
            (new Migrator($this->pdo, $this->dir))->run();
            $this->fail('The invalid migration must throw');
        } catch (PDOException) {
            $this->assertSame(['001_ok'], $this->recorded());
        }
    }
}
