<?php

declare(strict_types=1);

namespace Prism\History\Net;

/** Turns a host name into the IP addresses it points to (injectable, so tests need no DNS). */
interface Resolver
{
    /** @return list<string> every A and AAAA answer; empty when the name does not resolve */
    public function ips(string $host): array;
}
