<?php

declare(strict_types=1);

namespace Prism\History;

use DateTimeImmutable;
use DateTimeZone;
use Prism\History\Store\SnapshotStore;

/**
 * The one rule for calling TwitchTracker about a channel, used by the visit path and the scheduled job alike:
 * not if it already has an `ok` snapshot for today (UTC), and not if its newest non-error answer was
 * `untracked` and fewer than `$recheckDays` days have passed since. An `error` snapshot never blocks a call.
 */
final class TtPolicy
{
    public static function mayCall(SnapshotStore $snapshots, string $id, string $today, int $recheckDays): bool
    {
        if ($snapshots->hasOkFor($id, $today)) {
            return false;
        }

        $last = $snapshots->latestNonError($id);
        if ($last === null || $last['tt_status'] !== 'untracked') {
            return true;
        }

        $due = (new DateTimeImmutable($last['date'], new DateTimeZone('UTC')))
            ->modify('+' . $recheckDays . ' days')
            ->format('Y-m-d');

        return $today >= $due;
    }
}
