<?php

declare(strict_types=1);

namespace Prism\History\Tracker;

/** Waiting, injectable so tests do not really sleep. */
interface Sleeper
{
    public function sleepMs(int $ms): void;
}
