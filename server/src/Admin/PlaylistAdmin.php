<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use PDO;
use Prism\History\Clock;
use Prism\History\Playlist\ImportRules;
use Prism\History\Playlist\Importer;
use Prism\History\Playlist\M3uEntry;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\AuditStore;
use Prism\History\Store\StreamStore;
use Prism\History\Time;
use RuntimeException;
use Throwable;

/**
 * The owner's playlist actions. Each write is one database transaction together with its audit row (a change is never
 * recorded without happening, nor happens unrecorded), and the visitor snapshot is rewritten only AFTER the commit, so
 * a failed write never changes what visitors see. If only that rewrite fails the change stands and the answer says so
 * (`snapshot: false`): the list catches up on the next change or logo run.
 *
 * Every result is an array: `ok` true (with `public_id` for an add, and `snapshot`), or `ok` false with an `error` of
 * `not_found`, `rejected` (with a `reason`), `already_known` (with the `public_id`) or `not_listed`.
 */
final class PlaylistAdmin
{
    private const NAME_MAX = 200;
    private const LOGO_FILE = '/^[0-9a-f]{12}\.(?:png|jpg|gif|webp)$/D';
    /** Control characters and the bidirectional overrides that can disguise a name. */
    private const BAD_NAME_CHARS = '/[\p{Cc}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u';

    public function __construct(
        private PDO $pdo,
        private StreamStore $store,
        private AuditStore $audit,
        private SnapshotWriter $snapshot,
        private Clock $clock,
        private string $logoDir,
    ) {
    }

    /**
     * @param array{text?:string,state?:string,group?:string,country?:string} $filters
     * @return array{streams:list<array<string,mixed>>,total:int,counts:array<string,int>,limit:int,offset:int}
     */
    public function list(array $filters, int $limit, int $offset): array
    {
        $found = $this->store->search($filters, $limit, $offset);
        $counts = $this->store->countsByState();
        ksort($counts);

        return [
            'streams' => array_map(self::present(...), $found['rows']),
            'total' => $found['total'],
            'counts' => $counts,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }

    /** Adds a stream by the same rules as the import; it is stored with source "manual". */
    public function add(string $url, string $name, string $group): array
    {
        $name = self::cleanName($name);
        if ($name === null) {
            return self::rejected('bad_name');
        }
        $groupParts = self::groupParts($group);
        $decision = ImportRules::judge(new M3uEntry('', '', implode(';', $groupParts), $name, $url, false));
        if ($decision->verdict === 'reject') {
            return self::rejected((string) $decision->reason);
        }
        $normalised = (string) $decision->normalisedUrl;
        $id = StreamUrl::id($normalised);
        $publicId = StreamUrl::publicId($id);
        $existing = $this->store->findByPublicId($publicId);
        if ($existing !== null) {
            return $existing['id'] === $id ? ['ok' => false, 'error' => 'already_known', 'public_id' => $publicId] : self::rejected('id_clash');
        }

        try {
            $this->store->transaction(function () use ($id, $publicId, $normalised, $name, $decision): void {
                $this->store->insertIfNew([
                    'id' => $id,
                    'public_id' => $publicId,
                    'url' => $normalised,
                    'name' => $name,
                    'groups_json' => Importer::groupsJson($decision->groups),
                    'country' => null,
                    'kind' => $decision->kind,
                    'state' => $decision->state,
                    'state_reason' => $decision->reason,
                    'pinned' => 0,
                    'is_default' => 0,
                    'source' => 'manual',
                    'added_at' => Time::datetime($this->clock->nowMs()),
                ]);
                $this->audit->record('stream.add', $name, 'public_id=' . $publicId);
            });
        } catch (RuntimeException $e) {
            if ($e->getMessage() !== 'public id clash') {
                throw $e;
            }

            return self::rejected('id_clash');
        }

        return ['ok' => true, 'public_id' => $publicId, 'snapshot' => $this->rewriteSnapshot()];
    }

    /**
     * Renames a stream and replaces its groups (trimmed, de-duplicated, at most five of forty characters; none means
     * "Other"). A group the import would refuse (adult terms) is refused here too.
     *
     * @param list<string> $groups
     */
    public function update(string $publicId, string $name, array $groups): array
    {
        $row = $this->open($publicId);
        if ($row === null) {
            return self::notFound();
        }
        $name = self::cleanName($name);
        if ($name === null) {
            return self::rejected('bad_name');
        }
        $parts = [];
        foreach ($groups as $group) {
            $group = trim($group);
            if ($group !== '') {
                if (ImportRules::isAdultGroup($group)) {
                    return self::rejected('adult');
                }
                $parts[] = $group;
            }
        }
        $groupsJson = Importer::groupsJson(ImportRules::groupNames($parts));

        $this->store->transaction(function () use ($row, $name, $groupsJson): void {
            $this->store->rename((string) $row['id'], $name, $groupsJson);
            $this->audit->record('stream.update', $name, 'public_id=' . $row['public_id'] . '; was ' . json_encode((string) $row['name'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        });

        return ['ok' => true, 'snapshot' => $this->rewriteSnapshot()];
    }

    public function setPinned(string $publicId, bool $pinned): array
    {
        $row = $this->open($publicId);
        if ($row === null) {
            return self::notFound();
        }
        $this->store->transaction(function () use ($row, $pinned): void {
            $this->store->setPinned((string) $row['id'], $pinned);
            $this->audit->record('stream.pin', (string) $row['name'], 'public_id=' . $row['public_id'] . '; pinned=' . ($pinned ? '1' : '0'));
        });

        return ['ok' => true, 'snapshot' => $this->rewriteSnapshot()];
    }

    /** Makes one stream the page's default. Only a stream visitors can see may be it. */
    public function setDefault(string $publicId): array
    {
        $row = $this->open($publicId);
        if ($row === null) {
            return self::notFound();
        }
        if (!in_array($row['state'], StreamStore::LISTED, true)) {
            return ['ok' => false, 'error' => 'not_listed'];
        }
        $this->store->transaction(function () use ($row): void {
            $this->store->setDefault((string) $row['public_id']);
            $this->audit->record('stream.default', (string) $row['name'], 'public_id=' . $row['public_id']);
        });

        return ['ok' => true, 'snapshot' => $this->rewriteSnapshot()];
    }

    /** Removes a stream: a tombstone (so a re-import cannot bring it back), no longer default or pinned, its logo copy deleted. */
    public function remove(string $publicId): array
    {
        $row = $this->open($publicId);
        if ($row === null) {
            return self::notFound();
        }
        $this->store->transaction(function () use ($row): void {
            $this->store->tombstone((string) $row['id']);
            $this->audit->record('stream.remove', (string) $row['name'], 'public_id=' . $row['public_id']);
        });
        $this->deleteLogo($row['logo_file']);

        return ['ok' => true, 'snapshot' => $this->rewriteSnapshot()];
    }

    /** The stored row of a stream that is not removed, else null. */
    private function open(string $publicId): ?array
    {
        $row = $this->store->findByPublicId($publicId);

        return $row === null || $row['state'] === 'removed' ? null : $row;
    }

    private function rewriteSnapshot(): bool
    {
        try {
            $this->snapshot->write();

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    /** Only a file name of the shape the logo copier writes is ever deleted, and only inside the logo folder. */
    private function deleteLogo(mixed $file): void
    {
        if (is_string($file) && preg_match(self::LOGO_FILE, $file) === 1) {
            @unlink($this->logoDir . '/' . $file);
        }
    }

    /** A name of 1 to 200 characters with no control characters; the owner is told about a bad one rather than having it quietly changed. */
    private static function cleanName(string $name): ?string
    {
        $name = trim($name);
        if ($name === '' || !mb_check_encoding($name, 'UTF-8') || mb_strlen($name) > self::NAME_MAX || preg_match(self::BAD_NAME_CHARS, $name) === 1) {
            return null;
        }

        return $name;
    }

    /** @return list<string> */
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
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function present(array $row): array
    {
        $groups = json_decode((string) $row['groups_json'], true);

        return [
            'public_id' => (string) $row['public_id'],
            'name' => (string) $row['name'],
            'url' => (string) $row['url'],
            'groups' => is_array($groups) && array_is_list($groups) && $groups !== [] && array_filter($groups, 'is_string') === $groups ? $groups : ['Other'],
            'country' => $row['country'] === null ? null : (string) $row['country'],
            'kind' => (string) $row['kind'],
            'state' => (string) $row['state'],
            'state_reason' => $row['state_reason'] === null ? null : (string) $row['state_reason'],
            'pinned' => $row['pinned'] === 1,
            'is_default' => $row['is_default'] === 1,
            'source' => (string) $row['source'],
            'has_logo' => $row['logo_file'] !== null,
            'added_at' => (string) $row['added_at'],
        ];
    }

    /** @return array{ok:false,error:'rejected',reason:string} */
    private static function rejected(string $reason): array
    {
        return ['ok' => false, 'error' => 'rejected', 'reason' => $reason];
    }

    /** @return array{ok:false,error:'not_found'} */
    private static function notFound(): array
    {
        return ['ok' => false, 'error' => 'not_found'];
    }
}
