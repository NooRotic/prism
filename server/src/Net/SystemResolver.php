<?php

declare(strict_types=1);

namespace Prism\History\Net;

/** The real resolver: the host's DNS, asked for both A and AAAA records. */
final class SystemResolver implements Resolver
{
    public function ips(string $host): array
    {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if ($records === false) {
            return [];
        }
        $ips = [];
        foreach ($records as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (is_string($ip) && $ip !== '') {
                $ips[] = $ip;
            }
        }

        return array_values(array_unique($ips));
    }
}
