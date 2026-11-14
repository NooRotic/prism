<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

use Prism\History\Clock;
use Prism\History\Store\StreamStore;
use RuntimeException;

/**
 * Writes the one compact file visitors download: every listed stream, as short keys (the contract the HLS page reads).
 * It lives in the data folder, outside public/, and is served by the front controller (GET /api/streams) so it gets the
 * origin check and an ETag. Each file is written to a temporary name and renamed, so a reader never sees half a file.
 */
final class SnapshotWriter
{
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

    public function __construct(private StreamStore $store, private Clock $clock, private string $dataDir)
    {
    }

    /** The plain JSON file; the gzip copy sits next to it with ".gz" added. */
    public function path(): string
    {
        return $this->dataDir . '/streams.json';
    }

    /** @return array{streams:int,bytes:int,gzipped:int} */
    public function write(): array
    {
        $rows = $this->store->listed();
        $namesOf = array_map(static fn (array $r): array => self::groupNames((string) $r['groups_json']), $rows);

        $counts = [];
        foreach ($namesOf as $names) {
            foreach ($names as $name) {
                $counts[$name] = ($counts[$name] ?? 0) + 1;
            }
        }
        // A group called "2024" becomes an integer array key, hence the cast back to text.
        $groups = array_map(strval(...), array_keys($counts));
        usort($groups, static fn (string $a, string $b): int => ($counts[$b] <=> $counts[$a]) ?: strcasecmp($a, $b) ?: strcmp($a, $b));
        $index = array_flip($groups);

        $streams = [];
        $default = null;
        foreach ($rows as $i => $r) {
            if ($default === null && $r['is_default'] === 1) {
                $default = (string) $r['public_id'];
            }
            $streams[] = [
                'i' => (string) $r['public_id'],
                'n' => (string) $r['name'],
                'g' => array_map(static fn (string $name): int => $index[$name], $namesOf[$i]),
                'c' => $r['country'] === null ? null : (string) $r['country'],
                'l' => $r['logo_file'] === null ? null : (string) $r['logo_file'],
                'k' => (string) $r['kind'],
                'p' => $r['pinned'] === 1 ? 1 : 0,
                's' => (string) $r['state'],
                'u' => (string) $r['url'],
            ];
        }

        $json = json_encode([
            'v' => 1,
            'generated' => gmdate('Y-m-d\TH:i:s\Z', intdiv($this->clock->nowMs(), 1000)),
            'default' => $default,
            'groups' => $groups,
            'streams' => $streams,
        ], self::JSON_FLAGS);
        $gzip = gzencode($json, 9);
        if ($gzip === false) {
            throw new RuntimeException('Snapshot compression failed');
        }

        if (!is_dir($this->dataDir) && !@mkdir($this->dataDir, 0750, true) && !is_dir($this->dataDir)) {
            throw new RuntimeException('Snapshot folder could not be created');
        }
        $this->replace($this->path(), $json);
        $this->replace($this->path() . '.gz', $gzip);

        return ['streams' => count($streams), 'bytes' => strlen($json), 'gzipped' => strlen($gzip)];
    }

    /** @return list<string> a stored list of names, or ["Other"] when the text is not one */
    private static function groupNames(string $json): array
    {
        $decoded = json_decode($json, true);
        if (is_array($decoded) && array_is_list($decoded) && $decoded !== []) {
            $names = [];
            foreach ($decoded as $name) {
                if (!is_string($name) || $name === '') {
                    return ['Other'];
                }
                $names[] = $name;
            }

            return $names;
        }

        return ['Other'];
    }

    private function replace(string $path, string $bytes): void
    {
        $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) {
            @unlink($tmp);
            throw new RuntimeException('Snapshot write failed');
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('Snapshot write failed');
        }
    }
}
