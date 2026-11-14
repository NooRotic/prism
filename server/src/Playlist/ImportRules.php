<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/**
 * Which playlist entries may be stored at all, and in what state. These rules guard the import and, later, the admin
 * panel's "add a stream", so both let in exactly the same things.
 */
final class ImportRules
{
    /** The longest address the streams table can hold. */
    public const URL_MAX = 1000;

    private const MAX_GROUPS = 5;
    private const GROUP_MAX = 40;

    /** Query parameter names that carry a secret (IPTV subscription links, signed CDN URLs). */
    private const TOKEN_NAMES = [
        'token', 'tok', 'key', 'apikey', 'api_key', 'auth', 'authorization', 'password', 'pass', 'pwd', 'secret',
        'sig', 'signature', 'hdnts', 'hdnea', 'wmsauthsign', 'expires', 'exp',
    ];

    private const ADULT = '/(?<![\p{L}\p{N}])(?:(?:xxx|adult|porn|erotic|sex|hentai)(?![\p{L}\p{N}])|18\+)/iu';

    public static function judge(M3uEntry $e): ImportDecision
    {
        if ($e->hasPlayerOptions) {
            return self::reject('player_options');
        }
        $parts = parse_url(trim($e->url));
        if (is_array($parts) && (isset($parts['user']) || isset($parts['pass']))) {
            return self::reject('credentials');
        }
        $normalised = StreamUrl::normalise($e->url);
        if ($normalised === null || strlen($normalised) > self::URL_MAX) {
            return self::reject('bad_address');
        }
        if (self::hasTokenParameter($normalised)) {
            return self::reject('token');
        }
        $groupParts = self::groupParts($e->group);
        foreach ($groupParts as $part) {
            if (preg_match(self::ADULT, $part) === 1) {
                return self::reject('adult');
            }
        }

        [$state, $reason] = self::stateOf($normalised);

        return new ImportDecision(
            'accept',
            $state,
            $reason,
            $normalised,
            stripos((string) parse_url($normalised, PHP_URL_PATH), '.mpd') !== false ? 'dash' : 'hls',
            self::countryOf($e->tvgId),
            self::groupNames($groupParts),
        );
    }

    /** True when a group name is an adult-content term (whole words only): such a group is never accepted, however it arrives. */
    public static function isAdultGroup(string $name): bool
    {
        return preg_match(self::ADULT, $name) === 1;
    }

    private static function reject(string $reason): ImportDecision
    {
        return new ImportDecision('reject', null, $reason, null, 'hls', null, []);
    }

    private static function hasTokenParameter(string $normalised): bool
    {
        $query = (string) parse_url($normalised, PHP_URL_QUERY);
        if ($query === '') {
            return false;
        }
        foreach (explode('&', $query) as $pair) {
            $name = strtolower(urldecode(explode('=', $pair, 2)[0]));
            if (in_array($name, self::TOKEN_NAMES, true)) {
                return true;
            }
        }

        return false;
    }

    /** @return array{0:string,1:?string} */
    private static function stateOf(string $normalised): array
    {
        if (str_starts_with($normalised, 'http://')) {
            return ['unplayable', 'http'];
        }
        $port = parse_url($normalised, PHP_URL_PORT);
        if (is_int($port) && $port !== 80 && $port !== 443) {
            return ['held', 'port'];
        }

        return ['new', null];
    }

    /** The country of "ChannelName.us@SD": what follows the last dot, once the quality tag after "@" is cut. */
    private static function countryOf(string $tvgId): ?string
    {
        $id = explode('@', $tvgId, 2)[0];
        $dot = strrpos($id, '.');

        return $dot === false ? null : Countries::flagCode(substr($id, $dot + 1));
    }

    /** @return list<string> the non-empty, trimmed parts of the group text (names are not yet bounded) */
    private static function groupParts(string $group): array
    {
        $parts = [];
        foreach (explode(';', $group) as $part) {
            $part = trim($part);
            if ($part !== '') {
                $parts[] = $part;
            }
        }

        return $parts;
    }

    /**
     * @param list<string> $parts the trimmed, non-empty parts of a group text
     * @return list<string> at most five names of at most forty characters; "Undefined" shows to visitors as "Other"
     */
    public static function groupNames(array $parts): array
    {
        $names = [];
        foreach ($parts as $part) {
            $name = mb_strtolower($part) === 'undefined' ? 'Other' : mb_substr($part, 0, self::GROUP_MAX);
            if (!in_array($name, $names, true)) {
                $names[] = $name;
            }
        }

        return $names === [] ? ['Other'] : array_slice($names, 0, self::MAX_GROUPS);
    }
}
