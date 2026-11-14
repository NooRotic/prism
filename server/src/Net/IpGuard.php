<?php

declare(strict_types=1);

namespace Prism\History\Net;

use ValueError;

/**
 * Says whether an IP address is one the server may connect to on a visitor's or a playlist's say-so. A server that
 * fetches outside addresses can be pointed at its own network (loopback, a router, the cloud metadata address), so
 * everything that is not clearly a public address is refused: IPv4 by a list of special-purpose ranges, IPv6 only when
 * it is a global unicast address that does not carry an IPv4 address inside it (mapped, compatible, NAT64, 6to4, Teredo).
 */
final class IpGuard
{
    /** @var list<array{0:string,1:int}> IANA special-purpose IPv4 ranges (address, prefix length). */
    private const V4_BLOCKED = [
        ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
        ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
        ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];

    /** @var list<array{0:string,1:int}> Inside 2000::/3 but not for the open internet. */
    private const V6_NOT_PUBLIC = [
        ['2001::', 32], ['2001:2::', 48], ['2001:10::', 28], ['2001:20::', 28], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
    ];

    public static function isPublic(string $ip): bool
    {
        // inet_pton accepts only the canonical forms: no "127.1", no "0x7f.0.0.1", no padding, no zone ("%eth0").
        try {
            $bin = @inet_pton($ip);
        } catch (ValueError) {
            return false; // PHP 8 throws, rather than returns false, for text with a NUL byte in it
        }
        if ($bin === false) {
            return false;
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }

        return strlen($bin) === 4 ? self::publicV4($bin) : self::publicV6($bin);
    }

    private static function publicV4(string $bin): bool
    {
        foreach (self::V4_BLOCKED as [$base, $prefix]) {
            if (self::inRange($bin, $base, $prefix)) {
                return false;
            }
        }

        return true;
    }

    private static function publicV6(string $bin): bool
    {
        if (!self::inRange($bin, '2000::', 3)) {
            return false;
        }
        foreach (self::V6_NOT_PUBLIC as [$base, $prefix]) {
            if (self::inRange($bin, $base, $prefix)) {
                return false;
            }
        }

        return true;
    }

    private static function inRange(string $bin, string $base, int $prefix): bool
    {
        $baseBin = (string) inet_pton($base);
        $whole = intdiv($prefix, 8);
        if (substr($bin, 0, $whole) !== substr($baseBin, 0, $whole)) {
            return false;
        }
        $rest = $prefix % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;

        return (ord($bin[$whole]) & $mask) === (ord($baseBin[$whole]) & $mask);
    }
}
