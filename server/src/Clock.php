<?php

declare(strict_types=1);

namespace Prism\History;

/** The current time, injectable so tests control it. */
interface Clock
{
    /** Milliseconds since the Unix epoch. */
    public function nowMs(): int;
}
