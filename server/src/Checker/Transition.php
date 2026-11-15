<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/** What a check does to a stream's row: the state and reason it is in afterwards, and its failure bookkeeping. */
final class Transition
{
    public function __construct(
        public readonly string $state,
        public readonly ?string $reason,
        public readonly bool $everPassed,
        public readonly int $failDays,
        public readonly ?string $lastFailDay,
        /** True when the state or the reason differs from the row's. */
        public readonly bool $changed,
    ) {
    }
}
