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

    /** The logo copier's own lock, so a slow run of it never blocks the history refresh (and the other way round). */
    public const LOGOS = 'prism_playlist_logos';

    public function __construct(private PDO $pdo, private string $name = self::NAME)
    {
    }

    /** True when this connection now holds the lock; false when another run has it. Never waits. */
    public function acquire(): bool
    {
        $stmt = $this->pdo->prepare('SELECT GET_LOCK(?, 0)');
        $stmt->execute([$this->name]);

        return (int) $stmt->fetchColumn() === 1;
    }

    public function release(): void
    {
        $stmt = $this->pdo->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->execute([$this->name]);
        $stmt->fetchColumn();
    }
}
