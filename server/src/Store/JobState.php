<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/** A small key-value table for job bookkeeping: the cached Twitch token, TT call counters, the TT pause. */
final class JobState
{
    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    public function get(string $key): ?string
    {
        $stmt = $this->pdo->prepare('SELECT v FROM job_state WHERE k = ?');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();

        return $value === false ? null : (string) $value;
    }

    public function set(string $key, string $value): void
    {
        $this->pdo
            ->prepare(
                'INSERT INTO job_state (k, v, updated_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)',
            )
            ->execute([$key, $value, $this->now()]);
    }

    /**
     * Adds one to a counter and returns the new value. One statement does the add and LAST_INSERT_ID(expr)
     * hands the value back on this connection, so two callers never read each other's result.
     */
    public function incr(string $key): int
    {
        $this->pdo
            ->prepare(
                'INSERT INTO job_state (k, v, updated_at) VALUES (?, LAST_INSERT_ID(1), ?)
                 ON DUPLICATE KEY UPDATE v = LAST_INSERT_ID(CAST(v AS UNSIGNED) + 1), updated_at = VALUES(updated_at)',
            )
            ->execute([$key, $this->now()]);

        return (int) $this->pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn();
    }

    public function delete(string $key): void
    {
        $this->pdo->prepare('DELETE FROM job_state WHERE k = ?')->execute([$key]);
    }

    private function now(): string
    {
        return Time::datetime($this->clock->nowMs());
    }
}
