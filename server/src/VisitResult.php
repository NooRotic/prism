<?php

declare(strict_types=1);

namespace Prism\History;

/** How a visit ended. Only OK carries a payload; the HTTP layer maps each outcome to a status code. */
final class VisitResult
{
    public const OK = 'ok';
    public const INVALID = 'invalid';
    public const BLOCKED = 'blocked';
    public const NOT_FOUND = 'not_found';
    public const CAP = 'cap_reached';
    public const DISABLED = 'disabled';
    public const UNAVAILABLE = 'unavailable';

    /** @param array<string,mixed>|null $payload */
    public function __construct(
        public string $outcome,
        public ?array $payload = null,
    ) {
    }
}
