<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

use Prism\History\Clock;
use Prism\History\Net\SafeFetcher;
use Prism\History\Store\StreamStore;
use Prism\History\Tracker\Sleeper;
use Throwable;

/**
 * Copies each stream's channel picture once, so a visitor's browser only ever talks to PRISM's own server. A picture is
 * accepted only when its first bytes say PNG, JPEG, GIF or WebP (the file name and Content-Type are not believed: an
 * SVG can carry script) and it is at most 256 KiB. It is fetched through the guarded fetcher, so a playlist cannot aim
 * the server at its own network, and at most one request a second goes to any one host. A failed try is counted and
 * a stream is given up on after three.
 */
final class LogoFetcher
{
    public const MAX_BYTES = 262_144;
    private const SAME_HOST_GAP_MS = 1000;

    /** @var array<string,int> when each host was last asked, in this run (milliseconds) */
    private array $lastRequestAt = [];

    public function __construct(
        private SafeFetcher $fetcher,
        private StreamStore $store,
        private SnapshotWriter $snapshot,
        private Sleeper $sleeper,
        private Clock $clock,
        private string $logoDir,
    ) {
    }

    /** The image format the bytes begin with ("png", "jpg", "gif" or "webp"), or null for anything else. */
    public static function sniff(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return 'png';
        }
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if (str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a')) {
            return 'gif';
        }
        if (strlen($bytes) >= 12 && str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP') {
            return 'webp';
        }

        return null;
    }

    /** @return array{fetched:int,failed:int} */
    public function run(int $limit): array
    {
        $this->lastRequestAt = [];
        $fetched = 0;
        $failed = 0;
        foreach ($this->store->withLogoToFetch($limit) as $row) {
            $file = $this->copyOne((string) $row['public_id'], (string) $row['logo_url']);
            if ($file === null) {
                $this->store->recordLogo((string) $row['id'], null);
                $failed++;
                continue;
            }
            $this->store->recordLogo((string) $row['id'], $file);
            $fetched++;
        }
        if ($fetched > 0) {
            $this->snapshot->write();
        }

        return ['fetched' => $fetched, 'failed' => $failed];
    }

    /** The stored file name, or null when the picture could not be fetched, was refused, or could not be saved. */
    private function copyOne(string $publicId, string $logoUrl): ?string
    {
        $host = strtolower((string) parse_url($logoUrl, PHP_URL_HOST));
        if (isset($this->lastRequestAt[$host])) {
            $wait = $this->lastRequestAt[$host] + self::SAME_HOST_GAP_MS - $this->clock->nowMs();
            if ($wait > 0) {
                $this->sleeper->sleepMs($wait);
            }
        }
        // One request a second means one START a second, so the time is taken before the request, not after it.
        $this->lastRequestAt[$host] = $this->clock->nowMs();
        try {
            $result = $this->fetcher->fetch($logoUrl, self::MAX_BYTES);
        } catch (Throwable) {
            return null;
        }
        if ($result->error !== null || $result->status !== 200 || strlen($result->body) > self::MAX_BYTES) {
            return null;
        }
        $ext = self::sniff($result->body);
        if ($ext === null) {
            return null;
        }
        $name = $publicId . '.' . $ext;

        return $this->save($name, $result->body) ? $name : null;
    }

    private function save(string $name, string $bytes): bool
    {
        if (!is_dir($this->logoDir) && !@mkdir($this->logoDir, 0755, true) && !is_dir($this->logoDir)) {
            return false;
        }
        $path = $this->logoDir . '/' . $name;
        $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($tmp, $bytes) !== strlen($bytes)) {
            @unlink($tmp);

            return false;
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);

            return false;
        }

        return true;
    }
}
