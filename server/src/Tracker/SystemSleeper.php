<?php

declare(strict_types=1);

namespace Prism\History\Tracker;

final class SystemSleeper implements Sleeper
{
    public function sleepMs(int $ms): void
    {
        if ($ms > 0) {
            usleep($ms * 1000);
        }
    }
}
