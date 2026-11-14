<?php

declare(strict_types=1);

namespace Prism\History\Net;

/** What a pinned request got back: status 0 means no response at all; headers have lower-case names. */
final class PinnedResponse
{
    /** @param array<string,string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
        public readonly bool $truncated,
    ) {
    }
}
