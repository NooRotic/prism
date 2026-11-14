<?php

declare(strict_types=1);

namespace Prism\History;

use Prism\History\Store\JobState;

/**
 * A global (not per visitor) allowance per clock minute, kept in the database so separate requests share it.
 * It exists so a runaway script cannot fill a table or burn the Twitch budget; it never looks at who is asking.
 */
final class RateCap
{
    public function __construct(private JobState $state, private Clock $clock)
    {
    }

    /** Counts one use of `$name` in this minute; false once the minute's allowance is spent (the use is not counted again). */
    public function allow(string $name, int $perMinute): bool
    {
        $minute = gmdate('YmdHi', intdiv($this->clock->nowMs(), 1000));
        $prefix = 'cap:' . $name . ':';
        $count = $this->state->incr($prefix . $minute);
        if ($count === 1) {
            $this->state->pruneBefore($prefix, $prefix . $minute); // a new minute: older minutes are no use any more
        }

        return $count <= $perMinute;
    }
}
