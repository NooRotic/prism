<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Clock;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Tracker\Sleeper;

/**
 * At most one request a second to any one host: before each request it waits out whatever is left of the second since the
 * last request to that host started. A check makes up to three requests to one host back to back (playlist, variant,
 * segment), so this runs before every request, not once per stream. A worker resets it at the start of a run.
 */
final class HostPacer
{
    /** @var array<string,int> when the last request to each host started (milliseconds) */
    private array $lastAt = [];

    public function __construct(private Sleeper $sleeper, private Clock $clock, private int $gapMs = 1000)
    {
    }

    public function wait(string $url): void
    {
        $host = StreamUrl::host($url);
        if ($host === '') {
            return;
        }
        if (isset($this->lastAt[$host])) {
            $wait = $this->lastAt[$host] + $this->gapMs - $this->clock->nowMs();
            if ($wait > 0) {
                $this->sleeper->sleepMs($wait);
            }
        }
        // One request a second means one START a second: the time is taken after the wait, before the request.
        $this->lastAt[$host] = $this->clock->nowMs();
    }

    public function reset(): void
    {
        $this->lastAt = [];
    }
}
