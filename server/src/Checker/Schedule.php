<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Time;

/** How long a stream waits for its next check, by state and reason. `null` means it is never checked. */
final class Schedule
{
    private const DAY = 86_400;

    public static function intervalSeconds(string $state, ?string $reason): ?int
    {
        return match (true) {
            $state === 'new' => 0,
            $state === 'held' && $reason === 'awaiting_check' => 0,
            $state === 'working' => self::DAY,
            $state === 'suspect' => 6 * 3600,
            $state === 'dead' && $reason === 'never_passed' => self::DAY,
            $state === 'dead' => 2 * self::DAY,
            $state === 'unplayable' && $reason === 'no_cors' => 7 * self::DAY,
            $state === 'removed' && $reason === 'dead_14_days' => 30 * self::DAY,
            default => null,
        };
    }

    /** The UTC time (`Y-m-d H:i:s`) a stream put in this state at $nowMs is next due, or null when it never is. */
    public static function nextCheckAt(string $state, ?string $reason, int $nowMs): ?string
    {
        $seconds = self::intervalSeconds($state, $reason);

        return $seconds === null ? null : Time::datetime($nowMs + $seconds * 1000);
    }
}
