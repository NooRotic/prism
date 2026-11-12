<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;
use PDOException;
use RuntimeException;

final class Db
{
    /**
     * A strict, UTC connection. A failed connect is rethrown without the original message (and without
     * chaining it), because a driver message can carry the host and user, and the login must never leak.
     *
     * @param array{host:string,name:string,user:string,pass:string} $db
     */
    public static function connect(array $db): PDO
    {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']);
        try {
            $pdo = new PDO($dsn, $db['user'], $db['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec("SET time_zone = '+00:00'");
            $pdo->exec("SET sql_mode = 'STRICT_ALL_TABLES'");
        } catch (PDOException) {
            throw new RuntimeException('Database connection failed');
        }

        return $pdo;
    }
}
