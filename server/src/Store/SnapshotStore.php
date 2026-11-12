<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * One row per channel per UTC date. Rows come back as arrays with the keys the API uses (`rank`, not
 * `tt_rank`; `followers_change`, the net 30-day change). The TT figures are trailing 30-day aggregates.
 */
final class SnapshotStore
{
    private const DAY_MS = 86_400_000;
    private const COLUMNS = 'snap_date AS `date`, tt_rank AS `rank`, minutes_streamed, avg_viewers, max_viewers, hours_watched, followers_change, followers_total, tt_status, fetched_at';

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /**
     * Stores or replaces the row for a date. `$summary` is a TrackerResult summary (or [] when there is none);
     * a figure it lacks is stored as null, never 0.
     *
     * @param array<string,int|null> $summary
     */
    public function upsert(string $id, string $date, array $summary, string $ttStatus): void
    {
        $this->pdo
            ->prepare(
                'INSERT INTO snapshots
                    (twitch_id, snap_date, tt_rank, minutes_streamed, avg_viewers, max_viewers, hours_watched,
                     followers_change, followers_total, tt_status, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    tt_rank = VALUES(tt_rank), minutes_streamed = VALUES(minutes_streamed),
                    avg_viewers = VALUES(avg_viewers), max_viewers = VALUES(max_viewers),
                    hours_watched = VALUES(hours_watched), followers_change = VALUES(followers_change),
                    followers_total = VALUES(followers_total), tt_status = VALUES(tt_status),
                    fetched_at = VALUES(fetched_at)',
            )
            ->execute([
                $id,
                $date,
                $summary['rank'] ?? null,
                $summary['minutes_streamed'] ?? null,
                $summary['avg_viewers'] ?? null,
                $summary['max_viewers'] ?? null,
                $summary['hours_watched'] ?? null,
                $summary['followers'] ?? null,
                $summary['followers_total'] ?? null,
                $ttStatus,
                Time::datetime($this->clock->nowMs()),
            ]);
    }

    public function hasOkFor(string $id, string $date): bool
    {
        $stmt = $this->pdo->prepare("SELECT 1 FROM snapshots WHERE twitch_id = ? AND snap_date = ? AND tt_status = 'ok'");
        $stmt->execute([$id, $date]);

        return $stmt->fetchColumn() !== false;
    }

    /** @return array<string,mixed>|null */
    public function latest(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM snapshots WHERE twitch_id = ? ORDER BY snap_date DESC LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : self::shape($row);
    }

    /** The newest row that is not an error: an ok answer or an untracked one. @return array<string,mixed>|null */
    public function latestNonError(string $id): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT " . self::COLUMNS . " FROM snapshots WHERE twitch_id = ? AND tt_status <> 'error' ORDER BY snap_date DESC LIMIT 1",
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : self::shape($row);
    }

    /**
     * Oldest first. `$days` is the last N UTC calendar days including today; null means every row.
     *
     * @return list<array<string,mixed>>
     */
    public function history(string $id, ?int $days): array
    {
        if ($days === null) {
            $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM snapshots WHERE twitch_id = ? ORDER BY snap_date ASC');
            $stmt->execute([$id]);
        } else {
            $from = Time::date($this->clock->nowMs() - (max(1, $days) - 1) * self::DAY_MS);
            $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM snapshots WHERE twitch_id = ? AND snap_date >= ? ORDER BY snap_date ASC');
            $stmt->execute([$id, $from]);
        }

        return array_map(self::shape(...), $stmt->fetchAll());
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function shape(array $row): array
    {
        $int = static fn (mixed $v): ?int => $v === null ? null : (int) $v;

        return [
            'date' => (string) $row['date'],
            'rank' => $int($row['rank']),
            'minutes_streamed' => $int($row['minutes_streamed']),
            'avg_viewers' => $int($row['avg_viewers']),
            'max_viewers' => $int($row['max_viewers']),
            'hours_watched' => $int($row['hours_watched']),
            'followers_change' => $int($row['followers_change']),
            'followers_total' => $int($row['followers_total']),
            'tt_status' => (string) $row['tt_status'],
            'fetched_at' => (string) $row['fetched_at'],
        ];
    }
}
