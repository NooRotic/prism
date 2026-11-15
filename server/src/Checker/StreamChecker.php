<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Clock;
use Prism\History\Net\SafeFetcher;
use Prism\History\Net\SafeFetchResult;
use Prism\History\Playlist\StreamUrl;
use Throwable;

/**
 * Plays a stream's first moments the way a PRISM visitor's browser would, and says in one fixed code how it went. Every
 * request goes through the guarded fetcher, sends PRISM's origin, and must be answered with CORS that a browser would accept
 * (on every response of the chain, with `Origin: null` after a cross-origin hop). HLS: the playlist, its first variant, and the
 * first bytes of a segment (the second one when the list is live and long, because a live list's first segment is about to
 * expire). DASH: the manifest only. A result names neither the stream nor anything the other side said.
 */
final class StreamChecker
{
    /** Hosts the checker never fetches: PRISM has its own Twitch and YouTube paths, and these are not playlists. */
    public const DENY_HOSTS = ['twitch.tv', 'ttvnw.net', 'jtvnw.net', 'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com'];

    private const PLAYLIST_BYTES = 262_144;
    private const SEGMENT_BYTES = 65_536;
    private const REQUEST_SECONDS = 8;
    private const TOTAL_MS = 30_000;

    /** @param list<string> $denyHosts */
    public function __construct(
        private SafeFetcher $fetcher,
        private string $origin,
        private Clock $clock,
        private array $denyHosts = self::DENY_HOSTS,
    ) {
    }

    /** @param array<string,mixed> $row needs `url` and `kind` */
    public function check(array $row): CheckResult
    {
        $url = (string) ($row['url'] ?? '');
        $host = StreamUrl::host($url);
        foreach ($this->denyHosts as $denied) {
            if ($host === $denied || str_ends_with($host, '.' . $denied)) {
                return new CheckResult('skipped');
            }
        }

        $bytes = 0;
        $facts = [];
        try {
            $code = ($row['kind'] ?? 'hls') === 'dash' ? $this->dash($url, $bytes, $facts) : $this->hls($url, $bytes, $facts);
        } catch (Throwable) {
            $code = 'unreachable';
        }

        return new CheckResult($code, $bytes, $code === 'pass' ? $facts : []);
    }

    /** @param array<string,mixed> $facts */
    private function hls(string $url, int &$bytes, array &$facts): string
    {
        $deadline = $this->clock->nowMs() + self::TOTAL_MS;
        $headers = ['Origin' => $this->origin];

        $manifest = $this->get($url, self::PLAYLIST_BYTES, false, $headers, $bytes, $deadline);
        if (is_string($manifest)) {
            return $manifest;
        }
        if (!self::ok($manifest)) {
            return 'http_status';
        }
        if (!PlaylistReader::isPlaylist($manifest->body)) {
            return 'not_playlist';
        }
        if (!$this->cors($manifest)) {
            return 'no_cors';
        }
        $first = PlaylistReader::parse($manifest->body);
        $media = $manifest;
        $parsed = $first;

        if ($first['master']) {
            $child = $first['variants'] === [] ? null : SafeFetcher::resolveLocation($manifest->finalUrl, $first['variants'][0]);
            if ($child === null) {
                return 'no_variant';
            }
            $media = $this->get($child, self::PLAYLIST_BYTES, false, $headers, $bytes, $deadline);
            if (is_string($media)) {
                return $media;
            }
            if (!self::ok($media)) {
                return 'http_status';
            }
            if (!PlaylistReader::isPlaylist($media->body)) {
                return 'no_variant';
            }
            if (!$this->cors($media)) {
                return 'no_cors';
            }
            $parsed = PlaylistReader::parse($media->body);
        }

        if ($parsed['segments'] === []) {
            return 'no_segment';
        }
        $index = $parsed['live'] && count($parsed['segments']) >= 3 ? 1 : 0;
        $segmentUrl = SafeFetcher::resolveLocation($media->finalUrl, $parsed['segments'][$index]);
        if ($segmentUrl === null) {
            return 'no_segment';
        }
        $segment = $this->get($segmentUrl, self::SEGMENT_BYTES, true, $headers + ['Range' => 'bytes=0-' . (self::SEGMENT_BYTES - 1)], $bytes, $deadline);
        if (is_string($segment)) {
            return $segment;
        }
        // A server that ignores Range and sends the whole segment is normal: the probe cut at 64 KiB is a pass.
        if (($segment->status !== 200 && $segment->status !== 206) || $segment->body === '') {
            return 'segment_failed';
        }
        if (!$this->cors($segment)) {
            return 'no_cors';
        }

        $facts = [
            'live' => $parsed['live'],
            'variants' => max(1, (int) $first['facts']['variants']),
            'codecs' => $first['facts']['codecs'],
            'captions' => $first['facts']['captions'],
            'audio_languages' => $first['facts']['audio_languages'],
        ];

        return 'pass';
    }

    /** @param array<string,mixed> $facts */
    private function dash(string $url, int &$bytes, array &$facts): string
    {
        $deadline = $this->clock->nowMs() + self::TOTAL_MS;

        $manifest = $this->get($url, self::PLAYLIST_BYTES, false, ['Origin' => $this->origin], $bytes, $deadline);
        if (is_string($manifest)) {
            return $manifest;
        }
        if (!self::ok($manifest)) {
            return 'http_status';
        }
        if (!str_contains(substr($manifest->body, 0, 4096), '<MPD')) {
            return 'not_playlist';
        }
        if (!$this->cors($manifest)) {
            return 'no_cors';
        }
        $facts = ['live' => preg_match('/<MPD\b[^>]*\btype\s*=\s*"dynamic"/i', $manifest->body) === 1];

        return 'pass';
    }

    /**
     * @param array<string,string> $headers
     * @return SafeFetchResult|string the answer, or the result code that says why there is none
     */
    private function get(string $url, int $maxBytes, bool $probe, array $headers, int &$bytes, int $deadlineMs): SafeFetchResult|string
    {
        if ($this->clock->nowMs() > $deadlineMs) {
            return 'unreachable';
        }
        $r = $this->fetcher->fetch($url, $maxBytes, self::REQUEST_SECONDS, $headers, $probe);
        $bytes += strlen($r->body);
        if ($r->error !== null) {
            return match ($r->error) {
                'scheme' => 'insecure',
                'port', 'blocked' => 'blocked',
                'redirects' => 'redirects',
                'too_large' => 'too_large',
                default => 'unreachable', // dns, network
            };
        }

        return $r;
    }

    private static function ok(SafeFetchResult $r): bool
    {
        return $r->status >= 200 && $r->status <= 299;
    }

    /**
     * Whether a browser would accept the whole chain: every response (each redirect and the final one) allows the origin
     * that request carried: PRISM's, or `null` once a hop has left the origin the chain began on.
     */
    private function cors(SafeFetchResult $r): bool
    {
        $sent = $this->origin;
        $previous = null;
        foreach ($r->hops as $hop) {
            if ($previous !== null && SafeFetcher::originOf($hop['url']) !== SafeFetcher::originOf($previous)) {
                $sent = 'null';
            }
            $allow = trim($hop['headers']['access-control-allow-origin'] ?? '');
            if ($allow !== '*' && $allow !== $sent) {
                return false;
            }
            $previous = $hop['url'];
        }

        return $r->hops !== [];
    }
}
