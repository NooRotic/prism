<?php

declare(strict_types=1);

namespace Prism\History\Net;

/** One GET to an address somebody else already vetted: the request goes to $ip, whatever the host name in the URL says. */
interface PinnedTransport
{
    /** Never follows a redirect and never reads more than $maxBytes of the body. Status 0 for a failure of any kind. */
    public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = ''): PinnedResponse;
}
