<?php

declare(strict_types=1);

namespace Prism\History\Net;

use Throwable;

/**
 * Fetches an address somebody else supplied (a channel logo from a playlist) without letting that somebody aim the
 * server at its own network. Only http and https on ports 80 and 443; the name is resolved here and EVERY answer must be
 * a public address (one bad answer blocks the name); the request is pinned to the vetted address; every redirect is
 * resolved, vetted and pinned again, at most three of them. Failures are a fixed code, never text from the other side.
 */
final class SafeFetcher
{
    private const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
    private const PORTS = [80, 443];

    public function __construct(
        private Resolver $resolver,
        private PinnedTransport $transport,
        private string $userAgent,
        private int $maxRedirects = 3,
    ) {
    }

    public function fetch(string $url, int $maxBytes, int $timeoutSec = 8): SafeFetchResult
    {
        $current = $url;
        for ($hop = 0; ; $hop++) {
            $target = $this->vet($current);
            if (is_string($target)) {
                return self::failure($target, $current);
            }
            try {
                $response = $this->transport->get($current, $target['ip'], $target['port'], $maxBytes, $timeoutSec, $this->userAgent);
            } catch (Throwable) {
                return self::failure('network', $current);
            }
            if ($response->status === 0) {
                return self::failure('network', $current);
            }
            $location = $response->headers['location'] ?? null;
            if (in_array($response->status, self::REDIRECT_STATUSES, true) && $location !== null) {
                if ($hop >= $this->maxRedirects) {
                    return self::failure('redirects', $current);
                }
                $next = self::resolveLocation($current, $location);
                if ($next === null) {
                    return self::failure('blocked', $current);
                }
                $current = $next;
                continue;
            }
            $body = $response->body;
            $tooLarge = $response->truncated || strlen($body) > $maxBytes;
            if (strlen($body) > $maxBytes) {
                $body = substr($body, 0, $maxBytes);
            }

            return new SafeFetchResult($response->status, $response->headers, $body, $current, $tooLarge ? 'too_large' : null);
        }
    }

    /**
     * A Location header resolved against the address it came from (RFC 3986 section 5.2), or null when it is not a
     * usable address. An absolute address is returned as it is: the next vetting decides whether it is allowed.
     */
    public static function resolveLocation(string $base, string $location): ?string
    {
        $location = trim($location);
        if ($location === '' || strcspn($location, implode('', array_map('chr', range(0, 32))) . "\x7f") !== strlen($location)) {
            return null;
        }
        if (preg_match('/^[A-Za-z][A-Za-z0-9+.\-]*:/', $location) === 1) {
            return $location;
        }
        $b = parse_url($base);
        if ($b === false || !isset($b['scheme'], $b['host'])) {
            return null;
        }
        $scheme = strtolower($b['scheme']);
        $authority = $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($location, '//')) {
            return $scheme . ':' . $location;
        }
        $basePath = ($b['path'] ?? '') === '' ? '/' : $b['path'];

        $hash = strpos($location, '#');
        if ($hash !== false) {
            $location = substr($location, 0, $hash);
        }
        $q = strpos($location, '?');
        $path = $q === false ? $location : substr($location, 0, $q);
        $query = $q === false ? '' : substr($location, $q);

        if ($path === '') {
            return $scheme . '://' . $authority . $basePath . $query; // a query alone replaces the base's query
        }
        if ($path[0] !== '/') {
            $path = substr($basePath, 0, (int) strrpos($basePath, '/') + 1) . $path;
        }

        return $scheme . '://' . $authority . self::removeDotSegments($path) . $query;
    }

    private static function removeDotSegments(string $path): string
    {
        $segments = explode('/', ltrim($path, '/'));
        $last = count($segments) - 1;
        $out = [];
        foreach ($segments as $i => $segment) {
            if ($segment === '.' || $segment === '..') {
                if ($segment === '..') {
                    array_pop($out);
                }
                if ($i === $last) {
                    $out[] = '';
                }
                continue;
            }
            $out[] = $segment;
        }

        return '/' . implode('/', $out);
    }

    /** @return array{ip:string,port:int}|string the address to connect to, or the error code */
    private function vet(string $url): array|string
    {
        $p = parse_url($url);
        if ($p === false) {
            return 'scheme';
        }
        $scheme = strtolower($p['scheme'] ?? '');
        if (($scheme !== 'http' && $scheme !== 'https') || !isset($p['host']) || $p['host'] === '') {
            return 'scheme';
        }
        if (isset($p['user']) || isset($p['pass'])) {
            return 'blocked';
        }
        $port = $p['port'] ?? ($scheme === 'https' ? 443 : 80);
        if (!in_array($port, self::PORTS, true)) {
            return 'port';
        }
        $host = strtolower(trim($p['host'], '[]'));

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            $ips = [$host];
        } else {
            if (preg_match('/^[a-z0-9_](?:[a-z0-9_.\-]*[a-z0-9_])?$/D', $host) !== 1) {
                return 'dns';
            }
            // 2130706433, 0x7f.0.0.1, 0177.0.0.1, 127.1: spellings of an address that curl would read as one. Never a name.
            if (preg_match('/^(?:(?:[0-9]+|0x[0-9a-f]*)\.)*(?:[0-9]+|0x[0-9a-f]*)$/D', $host) === 1) {
                return 'blocked';
            }
            try {
                $ips = $this->resolver->ips($host);
            } catch (Throwable) {
                return 'dns';
            }
            if ($ips === []) {
                return 'dns';
            }
        }
        foreach ($ips as $ip) {
            if (!IpGuard::isPublic($ip)) {
                return 'blocked';
            }
        }
        // IPv4 first: the host may have no IPv6 route, and a single pinned address is all that is tried.
        usort($ips, static fn (string $a, string $b): int => str_contains($a, ':') <=> str_contains($b, ':'));

        return ['ip' => $ips[0], 'port' => $port];
    }

    private static function failure(string $error, string $url): SafeFetchResult
    {
        return new SafeFetchResult(0, [], '', $url, $error);
    }
}
