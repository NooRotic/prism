<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use PDO;
use Prism\History\Db;

/** The test database from the TEST_DB_* environment (set by docker-compose.test.yml). */
final class Database
{
    /** @return array{host:string,name:string,user:string,pass:string} */
    public static function config(): array
    {
        return [
            'host' => (string) getenv('TEST_DB_HOST'),
            'name' => (string) getenv('TEST_DB_NAME'),
            'user' => (string) getenv('TEST_DB_USER'),
            'pass' => (string) getenv('TEST_DB_PASS'),
        ];
    }

    public static function pdo(): PDO
    {
        return Db::connect(self::config());
    }

    public static function dropAll(PDO $pdo): void
    {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
            $pdo->exec('DROP TABLE `' . $table . '`');
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
}
