<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/**
 * Stops one bad day at a host from demoting streams that were good: when more than half of a host's streams fail in one run
 * (the host has at least four checked in it), the host is probably down or blocking this server, and those failures are not
 * held against the streams that passed before. Pure: results in, hosts out.
 */
final class HostGuard
{
    private const MIN_CHECKED = 4;

    /**
     * @param list<array{host:string,failed:bool}> $results one entry per stream checked in the run
     * @return array<string,true> the guarded hosts
     */
    public static function guardedHosts(array $results): array
    {
        $checked = [];
        $failed = [];
        foreach ($results as $r) {
            $checked[$r['host']] = ($checked[$r['host']] ?? 0) + 1;
            $failed[$r['host']] = ($failed[$r['host']] ?? 0) + ($r['failed'] ? 1 : 0);
        }

        $guarded = [];
        foreach ($checked as $host => $count) {
            if ($count >= self::MIN_CHECKED && $failed[$host] * 2 > $count) {
                $guarded[(string) $host] = true;
            }
        }

        return $guarded;
    }
}
