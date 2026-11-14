<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/**
 * A stream's identity. Two spellings of one address must give one id, so the address is normalised first
 * (scheme and host lower-cased, the default port and the fragment dropped) and the id is the SHA-256 of that text.
 */
final class StreamUrl
{
    /** The normalised address, or null unless it is an http(s) address with a host and no login in it. */
    public static function normalise(string $url): ?string
    {
        $url = trim($url);
        // Whitespace or a control character inside is never part of a real address (and would be a header-injection risk).
        if ($url === '' || strcspn($url, self::forbiddenBytes()) !== strlen($url)) {
            return null;
        }
        $p = parse_url($url);
        if ($p === false || !isset($p['scheme'], $p['host']) || $p['host'] === '') {
            return null;
        }
        if (isset($p['user']) || isset($p['pass'])) {
            return null;
        }
        $scheme = strtolower($p['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            return null;
        }
        $port = $p['port'] ?? null;
        if ($port === ($scheme === 'https' ? 443 : 80)) {
            $port = null;
        }
        $path = isset($p['path']) && $p['path'] !== '' ? $p['path'] : '/';
        $query = isset($p['query']) && $p['query'] !== '' ? '?' . $p['query'] : '';

        return $scheme . '://' . strtolower($p['host']) . ($port !== null ? ':' . $port : '') . $path . $query;
    }

    /** The stream's key: 64 lower-case hex characters. */
    public static function id(string $normalised): string
    {
        return hash('sha256', $normalised);
    }

    /** The short id used in page addresses (the first 12 characters of the key). */
    public static function publicId(string $id): string
    {
        return substr($id, 0, 12);
    }

    private static function forbiddenBytes(): string
    {
        return implode('', array_map('chr', range(0, 32))) . "\x7f";
    }
}
