<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * How many visitors have starred each stream: one counter per stream, no visitor column. The browser remembers what
 * it has starred and tells the server only "+1" or "-1", so nothing about a visitor is kept. A script can still push a
 * number up (the global cap slows that), so the count is a popularity signal and decides nothing.
 */
final class FavoriteStore
{
    /** The most streams one answer lists: the public list is a few thousand at most. */
    private const MAX_LISTED = 5000;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Adds one for the stream. One statement, so two requests at once both count. */
    public function add(string $publicId): void
    {
        $this->pdo
            ->prepare(
                'INSERT INTO stream_favorites (public_id, n, updated_at) VALUES (?, 1, ?)
                 ON DUPLICATE KEY UPDATE n = n + 1, updated_at = VALUES(updated_at)',
            )
            ->execute([$publicId, Time::datetime($this->clock->nowMs())]);
    }

    /** Takes one off, never below zero (a browser that lost its memory can "un-star" what was never counted). */
    public function remove(string $publicId): void
    {
        $this->pdo
            ->prepare('UPDATE stream_favorites SET n = n - 1, updated_at = ? WHERE public_id = ? AND n > 0')
            ->execute([Time::datetime($this->clock->nowMs()), $publicId]);
    }

    public function countFor(string $publicId): int
    {
        $stmt = $this->pdo->prepare('SELECT n FROM stream_favorites WHERE public_id = ?');
        $stmt->execute([$publicId]);
        $value = $stmt->fetchColumn();

        return $value === false ? 0 : (int) $value;
    }

    /**
     * The counts that are above zero, for streams on the public list only (a hidden stream's count is not shown),
     * most starred first.
     *
     * @return array<string,int> public id => count
     */
    public function listedCounts(): array
    {
        $in = implode(', ', array_fill(0, count(StreamStore::LISTED), '?'));
        $stmt = $this->pdo->prepare(
            'SELECT f.public_id, f.n FROM stream_favorites f
             JOIN streams s ON s.public_id = f.public_id
             WHERE f.n > 0 AND s.state IN (' . $in . ')
             ORDER BY f.n DESC, f.public_id ASC LIMIT ' . self::MAX_LISTED,
        );
        $stmt->execute(StreamStore::LISTED);

        $counts = [];
        foreach ($stmt->fetchAll() as $row) {
            $counts[(string) $row['public_id']] = (int) $row['n'];
        }

        return $counts;
    }
}
