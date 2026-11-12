<?php

declare(strict_types=1);

namespace Prism\History;

final class SystemClock implements Clock
{
    public function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }
}
