<?php

declare(strict_types=1);

namespace Prism\History\Http;

final class HttpResponse
{
    /**
     * @param int $status HTTP status, or 0 when there was no response at all
     * @param array<string,string> $headers header names in lower case
     */
    public function __construct(
        public int $status,
        public string $body,
        public array $headers = [],
    ) {
    }
}
