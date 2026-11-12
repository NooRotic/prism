<?php

declare(strict_types=1);

namespace Prism\History;

/**
 * Finds a channel's own YouTube and Kick links in its Twitch bio text. Pure: no network, no state.
 *
 * Only channel links count (a YouTube @handle, /channel/, /c/ or /user/ page; a Kick channel page), never a
 * video link or a lookalike host. Each link is normalised to https on a canonical host with trailing
 * punctuation removed, duplicates are dropped, and at most five are kept per platform.
 */
final class BioLinks
{
    private const MAX_PER_PLATFORM = 5;
    private const MAX_URL_LENGTH = 255;

    /** Kick pages that are not a channel. */
    private const KICK_RESERVED = ['video', 'videos', 'categories', 'category', 'browse', 'following', 'dashboard', 'settings', 'search', 'terms', 'privacy', 'about', 'clips'];

    // Not preceded by a host character, "/" or "@" (so notyoutube.com, evil.com/youtube.com and me@kick.com
    // are out); not followed by more host (so kick.com.evil.io and kick.com-evil.io are out).
    private const PATTERN = '~(?<![\w./@-])(?:https?://)?(?:www\.)?(youtube\.com|kick\.com)(?![\w-]|\.\w)(/[^\s<>"\'()\[\]{},;!?]*)?~i';

    /** @return list<array{platform:'youtube'|'kick',url:string}> */
    public static function extract(string $description): array
    {
        if (preg_match_all(self::PATTERN, $description, $matches, PREG_SET_ORDER) === 0) {
            return [];
        }

        $links = [];
        $seen = [];
        $perPlatform = ['youtube' => 0, 'kick' => 0];
        foreach ($matches as $match) {
            $platform = strtolower($match[1]) === 'kick.com' ? 'kick' : 'youtube';
            $channel = $platform === 'kick' ? self::kickChannel($match[2] ?? '') : self::youtubeChannel($match[2] ?? '');
            if ($channel === null) {
                continue;
            }
            $url = ($platform === 'kick' ? 'https://kick.com' : 'https://www.youtube.com') . $channel;
            $key = $platform . strtolower($channel);
            if (isset($seen[$key]) || strlen($url) > self::MAX_URL_LENGTH || $perPlatform[$platform] >= self::MAX_PER_PLATFORM) {
                continue;
            }
            $seen[$key] = true;
            $perPlatform[$platform]++;
            $links[] = ['platform' => $platform, 'url' => $url];
        }

        return $links;
    }

    /** "/@handle", "/channel/ID", "/c/name" or "/user/name" from the start of a path, else null. */
    private static function youtubeChannel(string $path): ?string
    {
        if (preg_match('~^/(@[\w.-]+|channel/[\w-]+|c/[\w.-]+|user/[\w.-]+)~', $path, $m) !== 1) {
            return null;
        }

        return '/' . rtrim($m[1], '.-');
    }

    /** "/name" for a Kick channel, else null. */
    private static function kickChannel(string $path): ?string
    {
        if (preg_match('~^/([\w-]+)~', $path, $m) !== 1) {
            return null;
        }
        $name = rtrim($m[1], '-');
        if ($name === '' || in_array(strtolower($name), self::KICK_RESERVED, true)) {
            return null;
        }

        return '/' . $name;
    }
}
