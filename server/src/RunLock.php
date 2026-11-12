<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;

/**
 * One scheduled run at a time. A MariaDB named lock needs no table and is released by the database itself if
 * the process dies, so a crashed run can never leave the next one locked out. It belongs to a connection, so
 * two separate cron processes cannot both hold it.
 */
final class RunLock
{
    public const NAME = 'prism_history_refresh';

    public function __construct(private PDO $pdo)
    {
    }

    /** True when this connection now holds the lock; false when another run has it. Never waits. */
    public function acquire(): bool
    {
        $stmt = $this->pdo->prepare('SELECT GET_LOCK(?, 0)');
        $stmt->execute([self::NAME]);

        return (int) $stmt->fetchColumn() === 1;
    }

    public function release(): void
    {
        $stmt = $this->pdo->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->execute([self::NAME]);
        $stmt->fetchColumn();
    }
}
