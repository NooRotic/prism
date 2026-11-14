<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * Daily counters, one row per UTC day and name (hit:<section>, new_channels, signed_out). Counts only: nothing
 * here says who or where. They are a floor (blocked pings never arrive) and a script can inflate them, so they
 * inform the owner and decide nothing.
 */
final class UsageCounters
{
    private const DAY_MS = 86_400_000;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Adds one to today's UTC row. One statement, so two requests at once both count. */
    public function increment(string $key): void
    {
        $this->pdo
            ->prepare(
                'INSERT INTO usage_counters (day_utc, k, n) VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE n = n + 1',
            )
            ->execute([Time::date($this->clock->nowMs()), $key]);
    }

    public function valueOn(string $date, string $key): int
    {
        $stmt = $this->pdo->prepare('SELECT n FROM usage_counters WHERE day_utc = ? AND k = ?');
        $stmt->execute([$date, $key]);
        $value = $stmt->fetchColumn();

        return $value === false ? 0 : (int) $value;
    }

    /**
     * Today and the days before it, oldest first, every day and key present (zero when nothing was counted).
     *
     * @param list<string> $keys
     * @return array<string,array<string,int>> UTC date => key => count
     */
    public function forDays(int $days, array $keys): array
    {
        $now = $this->clock->nowMs();
        $result = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $result[Time::date($now - $i * self::DAY_MS)] = array_fill_keys($keys, 0);
        }
        if ($keys === [] || $days < 1) {
            return $result;
        }

        $marks = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $this->pdo->prepare("SELECT day_utc, k, n FROM usage_counters WHERE day_utc >= ? AND k IN ({$marks})");
        $stmt->execute([array_key_first($result), ...$keys]);
        foreach ($stmt->fetchAll() as $row) {
            if (isset($result[$row['day_utc']][$row['k']])) {
                $result[$row['day_utc']][$row['k']] = (int) $row['n'];
            }
        }

        return $result;
    }
}
