<?php

declare(strict_types=1);

namespace Prism\History\Net;

/**
 * The outcome of a guarded fetch. $error is null or one of a fixed set of codes (blocked, port, scheme, dns, redirects,
 * too_large, network): never text from the other side, so nothing that was fetched can leak through an error message.
 */
final class SafeFetchResult
{
    /** @param array<string,string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
        public readonly string $finalUrl,
        public readonly ?string $error,
    ) {
    }
}
