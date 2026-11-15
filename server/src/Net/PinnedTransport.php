<?php

declare(strict_types=1);

namespace Prism\History\Net;

/** One GET to an address somebody else already vetted: the request goes to $ip, whatever the host name in the URL says. */
interface PinnedTransport
{
    /**
     * Never follows a redirect and never reads more than $maxBytes of the body. Status 0 for a failure of any kind.
     *
     * $requestHeaders are extra request headers (name => value). A $probe reads at most $maxBytes of a body of any announced
     * length and keeps the status and the bytes it got (`truncated` is then true): for the first bytes of a video segment.
     * Without it a body announced as longer than $maxBytes is refused before any of it is read.
     *
     * @param array<string,string> $requestHeaders
     */
    public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = '', array $requestHeaders = [], bool $probe = false): PinnedResponse;
}
