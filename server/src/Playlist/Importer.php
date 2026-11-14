<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

use Prism\History\Clock;
use Prism\History\Store\StreamStore;
use Prism\History\Time;
use RuntimeException;

/**
 * Brings a playlist into the store. It only ever INSERTS: a stream that is already known (even one the owner removed or
 * renamed) is left exactly as it is, so a re-import can never undo the owner's work. A real run is one transaction, so
 * a failure (such as a clash of the 12-character public id) leaves nothing half-imported.
 */
final class Importer
{
    private const NAME_MAX = 200;
    private const SOURCE_MAX = 60;
    private const GROUPS_JSON_MAX = 400;
    private const LOGO_URL_MAX = 500;

    public function __construct(private StreamStore $store, private Clock $clock)
    {
    }

    /**
     * @return array<string,int> entries inserted already_known duplicates rejected_* unplayable_http held_port.
     *     Every entry is counted once among inserted, already_known, duplicates and rejected_*; unplayable_http and
     *     held_port say how many of the stored (or already known) ones are not shown to visitors.
     */
    public function import(string $m3uText, string $batch, bool $write): array
    {
        $counts = [
            'entries' => 0, 'inserted' => 0, 'already_known' => 0, 'duplicates' => 0,
            'rejected_player_options' => 0, 'rejected_credentials' => 0, 'rejected_bad_address' => 0,
            'rejected_token' => 0, 'rejected_adult' => 0, 'unplayable_http' => 0, 'held_port' => 0,
        ];
        $run = function () use ($m3uText, $batch, $write, &$counts): void {
            $seen = [];
            $owners = [];
            foreach (M3uParser::parse($m3uText) as $entry) {
                $counts['entries']++;
                $decision = ImportRules::judge($entry);
                if ($decision->verdict === 'reject') {
                    $counts['rejected_' . $decision->reason]++;
                    continue;
                }
                $url = (string) $decision->normalisedUrl;
                $id = StreamUrl::id($url);
                if (isset($seen[$id])) {
                    $counts['duplicates']++;
                    continue;
                }
                $seen[$id] = true;
                $publicId = StreamUrl::publicId($id);
                if (isset($owners[$publicId])) {
                    throw new RuntimeException('public id clash');
                }
                $owners[$publicId] = $id;
                $existing = $this->store->findByPublicId($publicId);
                if ($existing !== null && $existing['id'] !== $id) {
                    throw new RuntimeException('public id clash');
                }
                $inserted = $existing === null;
                if ($inserted && $write) {
                    $inserted = $this->store->insertIfNew($this->row($entry, $decision, $id, $publicId, $batch));
                }
                $counts[$inserted ? 'inserted' : 'already_known']++;
                if ($decision->state === 'unplayable') {
                    $counts['unplayable_http']++;
                } elseif ($decision->state === 'held') {
                    $counts['held_port']++;
                }
            }
        };
        $write ? $this->store->transaction($run) : $run();

        return $counts;
    }

    /**
     * Adds PRISM's demo streams (pinned, working) and, when no stream is the default yet, makes Big Buck Bunny the
     * default. Seeding again adds nothing and never moves a default the owner chose later.
     *
     * @return int how many demo streams were (or, in a dry run, would be) added
     */
    public function seedDemos(bool $write): int
    {
        $added = 0;
        $run = function () use ($write, &$added): void {
            $defaultPublicId = null;
            foreach (DemoStreams::ALL as $demo) {
                $url = (string) StreamUrl::normalise($demo['url']);
                $id = StreamUrl::id($url);
                $publicId = StreamUrl::publicId($id);
                if ($demo['id'] === DemoStreams::DEFAULT_ID) {
                    $defaultPublicId = $publicId;
                }
                $existing = $this->store->findByPublicId($publicId);
                if ($existing !== null && $existing['id'] !== $id) {
                    throw new RuntimeException('public id clash');
                }
                if ($existing !== null) {
                    continue;
                }
                if ($write) {
                    $this->store->insertIfNew([
                        'id' => $id,
                        'public_id' => $publicId,
                        'url' => $url,
                        'name' => $demo['name'],
                        'groups_json' => '["Demo"]',
                        'kind' => $demo['kind'],
                        'state' => 'working',
                        'pinned' => 1,
                        'source' => 'demo',
                        'added_at' => Time::datetime($this->clock->nowMs()),
                    ]);
                }
                $added++;
            }
            if ($write && $defaultPublicId !== null && $this->store->defaultPublicId() === null) {
                $this->store->setDefault($defaultPublicId);
            }
        };
        $write ? $this->store->transaction($run) : $run();

        return $added;
    }

    /** @return array<string,mixed> */
    private function row(M3uEntry $entry, ImportDecision $d, string $id, string $publicId, string $batch): array
    {
        return [
            'id' => $id,
            'public_id' => $publicId,
            'url' => (string) $d->normalisedUrl,
            'name' => $this->name($entry, (string) $d->normalisedUrl),
            'groups_json' => self::groupsJson($d->groups),
            'country' => $d->country,
            'kind' => $d->kind,
            'state' => $d->state,
            'state_reason' => $d->reason,
            'pinned' => 0,
            'is_default' => 0,
            'source' => mb_substr($batch, 0, self::SOURCE_MAX),
            'logo_url' => self::logoUrl($entry->logo),
            'added_at' => Time::datetime($this->clock->nowMs()),
        ];
    }

    /** The entry's name, else the channel name part of its id ("SomeChannel" of "SomeChannel.us@SD"), else the host. */
    private function name(M3uEntry $entry, string $url): string
    {
        $name = $entry->name;
        if ($name === '') {
            $id = explode('@', $entry->tvgId, 2)[0];
            $dot = strrpos($id, '.');
            $name = $dot === false ? $id : substr($id, 0, $dot);
        }
        if ($name === '') {
            $name = (string) parse_url($url, PHP_URL_HOST);
        }

        return mb_substr($name, 0, self::NAME_MAX);
    }

    /** @param list<string> $groups the JSON always fits the column: names are dropped from the end until it does */
    public static function groupsJson(array $groups): string
    {
        while ($groups !== []) {
            $json = json_encode($groups, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (mb_strlen($json) <= self::GROUPS_JSON_MAX) {
                return $json;
            }
            array_pop($groups);
        }

        return '["Other"]';
    }

    /**
     * The logo address to copy later: an http(s) address that fits the column and does not name an SVG (the copy would
     * be refused anyway, and each try costs a rate-limited request). A PNG render of an SVG ("x.svg/512px-x.svg.png") is kept.
     */
    private static function logoUrl(string $logo): ?string
    {
        $normalised = $logo === '' ? null : StreamUrl::normalise($logo);
        if ($normalised === null || strlen($normalised) > self::LOGO_URL_MAX) {
            return null;
        }
        $path = (string) parse_url($normalised, PHP_URL_PATH);
        if (preg_match('/\.svgz?$/i', $path) === 1) {
            return null;
        }

        return $normalised;
    }
}
