<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;
use Throwable;

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

    /** The stream checker's launch lock: one launch at a time, whatever the number of workers it starts. */
    public const CHECKER = 'prism_playlist_check';

    public function __construct(private PDO $pdo, private string $name = self::NAME)
    {
    }

    /**
     * True when this connection now holds the lock; false when another run has it. Never waits. The holder's connection may sit
     * idle for as long as its run takes (the checker's launcher waits for its workers for up to an hour), and a database that
     * closes idle connections early would free the lock silently, so a holder asks to be left connected for eight hours. A host
     * that does not allow it keeps its own limit.
     */
    public function acquire(): bool
    {
        $stmt = $this->pdo->prepare('SELECT GET_LOCK(?, 0)');
        $stmt->execute([$this->name]);
        $held = (int) $stmt->fetchColumn() === 1;
        if ($held) {
            try {
                $this->pdo->exec('SET SESSION wait_timeout = 28800');
            } catch (Throwable) {
                // not allowed here: the lock is still held
            }
        }

        return $held;
    }

    public function release(): void
    {
        $stmt = $this->pdo->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->execute([$this->name]);
        $stmt->fetchColumn();
    }
}
