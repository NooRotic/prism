<?php

declare(strict_types=1);

namespace Prism\History\Store;

use InvalidArgumentException;
use PDO;
use PDOException;
use Prism\History\Clock;
use Prism\History\Time;
use RuntimeException;
use Throwable;

/**
 * The playlist's streams (migration 003). Rows are keyed by the SHA-256 of the normalised address. Visitors only ever
 * see the states in LISTED; the rest (held, unplayable, dead, removed) are kept as rows so nothing is brought back.
 */
final class StreamStore
{
    /** The states a visitor may see. */
    public const LISTED = ['new', 'working', 'suspect'];

    private const COLUMNS = [
        'id', 'public_id', 'url', 'name', 'groups_json', 'country', 'kind', 'state', 'state_reason', 'pinned', 'is_default',
        'source', 'logo_url', 'logo_file', 'logo_tries', 'added_at', 'last_checked_at', 'facts_json',
    ];

    /** Everything except facts_json, which can be large and is only read by the checker and the admin side. */
    private const READ = 'id, public_id, url, name, groups_json, country, kind, state, state_reason, pinned, is_default, source, logo_url, logo_file, logo_tries, added_at, last_checked_at';

    private const LOGO_FILE = '/^[0-9a-f]{12}\.(?:png|jpg|gif|webp)$/D';
    private const MAX_LOGO_TRIES = 3;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /**
     * Inserts a stream unless its key is already stored; a known stream is never touched.
     *
     * @param array<string,mixed> $row keys are column names; id, public_id, url, name, groups_json, kind and source are needed
     * @throws RuntimeException('public id clash') when only the short public id is already taken by another stream
     */
    public function insertIfNew(array $row): bool
    {
        foreach (array_keys($row) as $column) {
            if (!in_array($column, self::COLUMNS, true)) {
                throw new InvalidArgumentException('Unknown streams column');
            }
        }
        $row['added_at'] ??= Time::datetime($this->clock->nowMs());
        if ($this->exists((string) $row['id'])) {
            return false;
        }
        $columns = array_keys($row);
        $sql = 'INSERT INTO streams (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')';
        try {
            $this->pdo->prepare($sql)->execute(array_values($row));
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') {
                throw $e;
            }

            // A duplicate key: either this very stream was inserted a moment ago, or only the short id clashes.
            if ($this->exists((string) $row['id'])) {
                return false;
            }
            throw new RuntimeException('public id clash');
        }

        return true;
    }

    public function exists(string $id): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM streams WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->fetchColumn() !== false;
    }

    /** @return array<string,mixed>|null */
    public function findByPublicId(string $publicId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::READ . ' FROM streams WHERE public_id = ?');
        $stmt->execute([$publicId]);
        $row = $stmt->fetch();

        return $row === false ? null : self::typed($row);
    }

    /**
     * What visitors see: pinned first, then by name (the column's collation ignores case), the short id last so the
     * order is the same every time.
     *
     * @return list<array<string,mixed>>
     */
    public function listed(): array
    {
        $in = implode(', ', array_fill(0, count(self::LISTED), '?'));
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::READ . " FROM streams WHERE state IN ({$in}) ORDER BY pinned DESC, name ASC, public_id ASC",
        );
        $stmt->execute(self::LISTED);

        return array_map(self::typed(...), $stmt->fetchAll());
    }

    /** @return array<string,int> */
    public function countsByState(): array
    {
        $counts = [];
        foreach ($this->pdo->query('SELECT state, COUNT(*) AS n FROM streams GROUP BY state')->fetchAll() as $r) {
            $counts[(string) $r['state']] = (int) $r['n'];
        }

        return $counts;
    }

    public function defaultPublicId(): ?string
    {
        $value = $this->pdo->query('SELECT public_id FROM streams WHERE is_default = 1 ORDER BY id LIMIT 1')->fetchColumn();

        return $value === false ? null : (string) $value;
    }

    /** Makes one visible stream the page's default and every other stream not; false (changing nothing) for any other id. */
    public function setDefault(string $publicId): bool
    {
        return $this->transaction(function () use ($publicId): bool {
            $in = implode(', ', array_fill(0, count(self::LISTED), '?'));
            $find = $this->pdo->prepare("SELECT 1 FROM streams WHERE public_id = ? AND state IN ({$in})");
            $find->execute([$publicId, ...self::LISTED]);
            if ($find->fetchColumn() === false) {
                return false;
            }
            $this->pdo->exec('UPDATE streams SET is_default = 0 WHERE is_default = 1');
            $this->pdo->prepare('UPDATE streams SET is_default = 1 WHERE public_id = ?')->execute([$publicId]);

            return true;
        });
    }

    /**
     * Streams whose logo still has to be copied: an address is known, no copy exists, fewer than three failed tries,
     * and the stream is one a visitor can see (nobody needs a picture of a held or removed stream).
     *
     * @return list<array<string,mixed>>
     */
    public function withLogoToFetch(int $limit): array
    {
        if ($limit < 1) {
            return [];
        }
        $in = implode(', ', array_fill(0, count(self::LISTED), '?'));
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::READ . " FROM streams WHERE logo_url IS NOT NULL AND logo_file IS NULL AND logo_tries < ? AND state IN ({$in})
             ORDER BY pinned DESC, added_at ASC, id ASC LIMIT {$limit}",
        );
        $stmt->execute([self::MAX_LOGO_TRIES, ...self::LISTED]);

        return array_map(self::typed(...), $stmt->fetchAll());
    }

    /** A file name (our own copy exists), or null to count one more failed try. */
    public function recordLogo(string $id, ?string $file): void
    {
        if ($file === null) {
            $this->pdo->prepare('UPDATE streams SET logo_tries = LEAST(logo_tries + 1, 255) WHERE id = ?')->execute([$id]);

            return;
        }
        if (preg_match(self::LOGO_FILE, $file) !== 1) {
            throw new InvalidArgumentException('Not a logo file name');
        }
        $this->pdo->prepare('UPDATE streams SET logo_file = ? WHERE id = ?')->execute([$file, $id]);
    }

    /**
     * Runs the callback in one transaction (or inside the caller's, when one is open): an exception undoes everything.
     *
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        if ($this->pdo->inTransaction()) {
            return $fn();
        }
        $this->pdo->beginTransaction();
        try {
            $result = $fn();
            $this->pdo->commit();

            return $result;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function typed(array $row): array
    {
        foreach (['pinned', 'is_default', 'logo_tries'] as $key) {
            if (array_key_exists($key, $row)) {
                $row[$key] = (int) $row[$key];
            }
        }

        return $row;
    }
}
