<?php

declare(strict_types=1);

namespace Prism\History\Http;

/** The only way the service talks to the outside world, so tests can replace the network. */
interface HttpClient
{
    /**
     * Never throws: a network failure or timeout comes back as status 0 with an empty body.
     *
     * @param array<string,string> $headers header name => value
     */
    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSec = 10,
    ): HttpResponse;
}
