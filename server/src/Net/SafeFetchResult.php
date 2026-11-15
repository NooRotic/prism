<?php

declare(strict_types=1);

namespace Prism\History\Net;

/**
 * The outcome of a guarded fetch. $error is null or one of a fixed set of codes (blocked, port, scheme, dns, redirects,
 * too_large, network): never text from the other side, so nothing that was fetched can leak through an error message.
 * $hops lists every response the chain got, in order (each redirect, then the final answer), with the address it came
 * from and its headers (lower-case names); a failure before the first request has none.
 */
final class SafeFetchResult
{
    /**
     * @param array<string,string> $headers
     * @param list<array{status:int,url:string,headers:array<string,string>}> $hops
     */
    public function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
        public readonly string $finalUrl,
        public readonly ?string $error,
        public readonly array $hops = [],
    ) {
    }
}
