<?php

declare(strict_types=1);

namespace Prism\History\Store;

use InvalidArgumentException;
use PDO;
use PDOException;
use Prism\History\Checker\CheckResult;
use Prism\History\Checker\Schedule;
use Prism\History\Checker\Transition;
use Prism\History\Clock;
use Prism\History\Playlist\StreamUrl;
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

    /** Every state a stream can be in (the column's ENUM). */
    public const STATES = ['new', 'working', 'suspect', 'dead', 'removed', 'unplayable', 'held'];

    private const COLUMNS = [
        'id', 'public_id', 'url', 'name', 'groups_json', 'country', 'kind', 'state', 'state_reason', 'pinned', 'is_default',
        'source', 'logo_url', 'logo_file', 'logo_tries', 'added_at', 'last_checked_at', 'facts_json',
        'host', 'ever_passed', 'fail_days', 'last_fail_day', 'check_result', 'check_bytes', 'state_changed_at', 'next_check_at',
    ];

    /** Everything except facts_json, which can be large and is only written by the checker. */
    private const READ = 'id, public_id, url, name, groups_json, country, kind, state, state_reason, pinned, is_default, source, logo_url, logo_file, logo_tries, added_at, last_checked_at, host, ever_passed, fail_days, last_fail_day, check_result, state_changed_at, next_check_at';

    /** The states and reasons the checker looks at (the rest are the owner's, or never checked): the timing table of Schedule. */
    private const CHECKABLE = "(state IN ('new', 'working', 'suspect', 'dead')
        OR (state = 'unplayable' AND state_reason = 'no_cors')
        OR (state = 'held' AND state_reason = 'awaiting_check')
        OR (state = 'removed' AND state_reason = 'dead_14_days'))";

    /** The streams the first pass has to check: the ones visitors can see, and the held ones waiting for their first check. */
    private const ELIGIBLE = "(state IN ('new', 'working', 'suspect') OR (state = 'held' AND state_reason = 'awaiting_check'))";

    private const MAX_BYTES = 4_294_967_295;

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
        $row['host'] ??= StreamUrl::host((string) ($row['url'] ?? ''));
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

    /**
     * Every stream, in every state (the owner's view), filtered and paged. Filters: `text` (every word must be in the name;
     * % and _ mean themselves), `state`, `group` (an exact group name) and `country`. Same order as the visitor list.
     *
     * @param array{text?:string,state?:string,group?:string,country?:string} $filters
     * @return array{rows:list<array<string,mixed>>,total:int}
     */
    public function search(array $filters, int $limit, int $offset): array
    {
        $where = [];
        $args = [];
        foreach (preg_split('/\s+/', trim((string) ($filters['text'] ?? '')), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
            $where[] = "name LIKE ? ESCAPE '|'";
            $args[] = '%' . str_replace(['|', '%', '_'], ['||', '|%', '|_'], $word) . '%';
        }
        $state = (string) ($filters['state'] ?? '');
        if ($state !== '') {
            $where[] = in_array($state, self::STATES, true) ? 'state = ?' : '1 = 0';
            if (in_array($state, self::STATES, true)) {
                $args[] = $state;
            }
        }
        $group = (string) ($filters['group'] ?? '');
        if ($group !== '') {
            $where[] = 'JSON_CONTAINS(groups_json, JSON_QUOTE(?))';
            $args[] = $group;
        }
        $country = (string) ($filters['country'] ?? '');
        if ($country !== '') {
            $where[] = 'country = ?';
            $args[] = $country;
        }
        $clause = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);

        $count = $this->pdo->prepare('SELECT COUNT(*) FROM streams' . $clause);
        $count->execute($args);
        $limit = max(1, $limit);
        $offset = max(0, $offset);
        $page = $this->pdo->prepare(
            'SELECT ' . self::READ . ' FROM streams' . $clause . " ORDER BY pinned DESC, name ASC, public_id ASC LIMIT {$limit} OFFSET {$offset}",
        );
        $page->execute($args);

        return ['rows' => array_map(self::typed(...), $page->fetchAll()), 'total' => (int) $count->fetchColumn()];
    }

    /** Renames a stream and replaces its group list (JSON text that already fits the column). */
    public function rename(string $id, string $name, string $groupsJson): void
    {
        $this->pdo->prepare('UPDATE streams SET name = ?, groups_json = ? WHERE id = ?')->execute([$name, $groupsJson, $id]);
    }

    public function setPinned(string $id, bool $pinned): void
    {
        $this->pdo->prepare('UPDATE streams SET pinned = ? WHERE id = ?')->execute([$pinned ? 1 : 0, $id]);
    }

    /** Turns a stream into a tombstone: state removed, no longer default or pinned, no logo copy. The row stays so a re-import cannot bring it back. */
    public function tombstone(string $id): void
    {
        $this->pdo
            ->prepare("UPDATE streams SET state = 'removed', state_reason = NULL, pinned = 0, is_default = 0, logo_file = NULL WHERE id = ?")
            ->execute([$id]);
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

    // ---- The checker

    /**
     * The streams a worker has to check now: its slice of hosts (`MOD(CRC32(host), $workers) = $worker`, so one host's streams
     * are never split), in a state the checker owns, and due. Never-checked streams come first, then suspect ones, then the
     * oldest check; an owner's removal, http and a refused port are never here.
     *
     * @return list<array<string,mixed>>
     */
    public function dueForCheck(int $worker, int $workers, int $limit, int $nowMs): array
    {
        if ($limit < 1) {
            return [];
        }
        $workers = max(1, $workers);
        if ($worker < 0 || $worker >= $workers) {
            throw new InvalidArgumentException('Not a slice of the workers');
        }
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::READ . ' FROM streams
             WHERE MOD(CRC32(host), :n) = :k AND ' . self::CHECKABLE . " AND (next_check_at IS NULL OR next_check_at <= :now)
             ORDER BY CASE WHEN state IN ('new', 'held') THEN 0 WHEN state = 'suspect' THEN 1 ELSE 2 END,
                      COALESCE(last_checked_at, '1970-01-01 00:00:00') ASC, id ASC
             LIMIT {$limit}",
        );
        $stmt->bindValue('n', $workers, PDO::PARAM_INT);
        $stmt->bindValue('k', $worker, PDO::PARAM_INT);
        $stmt->bindValue('now', Time::datetime($nowMs));
        $stmt->execute();

        return array_map(self::typed(...), $stmt->fetchAll());
    }

    /** Records a check without changing anything visitors see (the shadow run): the result, the bytes, the facts, and a day until the next. */
    public function recordShadow(string $id, CheckResult $result, int $nowMs): void
    {
        $this->pdo
            ->prepare('UPDATE streams SET check_result = ?, check_bytes = ?, facts_json = COALESCE(?, facts_json), last_checked_at = ?, next_check_at = ? WHERE id = ?')
            ->execute([
                $result->code,
                self::bytes($result->bytes),
                self::factsJson($result),
                Time::datetime($nowMs),
                Time::datetime($nowMs + 86_400_000),
                $id,
            ]);
    }

    /**
     * Writes a transition, but only if the row is still in the state and reason the worker read (the owner may have removed,
     * pinned or edited it meanwhile): false, changing nothing, when it is not. The next check is due by the schedule of the new
     * state, except that a result with no information about a stream that is due at once waits a day instead of coming straight
     * back. $recordResult false (Apply) leaves the recorded result, bytes, facts and check time as they are.
     */
    public function applyTransition(string $id, string $expectedState, ?string $expectedReason, Transition $t, CheckResult $result, int $nowMs, bool $recordResult = true): bool
    {
        return $this->transaction(function () use ($id, $expectedState, $expectedReason, $t, $result, $nowMs, $recordResult): bool {
            // The row is locked, so "still as it was" and "write" are one step; the update count cannot say it (a write of
            // identical values counts as zero rows).
            $lock = $this->pdo->prepare('SELECT 1 FROM streams WHERE id = ? AND state = ? AND state_reason <=> ? FOR UPDATE');
            $lock->execute([$id, $expectedState, $expectedReason]);
            if ($lock->fetchColumn() === false) {
                return false;
            }

            $now = Time::datetime($nowMs);
            $seconds = Schedule::intervalSeconds($t->state, $t->reason);
            if ($seconds === 0 && $result->isNoInformation()) {
                $seconds = 86_400;
            }
            $set = ['state = ?', 'state_reason = ?', 'ever_passed = ?', 'fail_days = ?', 'last_fail_day = ?', 'next_check_at = ?'];
            $args = [$t->state, $t->reason, $t->everPassed ? 1 : 0, $t->failDays, $t->lastFailDay, $seconds === null ? null : Time::datetime($nowMs + $seconds * 1000)];
            if ($t->changed) {
                $set[] = 'state_changed_at = ?';
                $args[] = $now;
            }
            if ($t->state === 'removed') {
                $set[] = 'logo_file = NULL';
            }
            if ($recordResult) {
                array_push($set, 'check_result = ?', 'check_bytes = ?', 'facts_json = COALESCE(?, facts_json)', 'last_checked_at = ?');
                array_push($args, $result->code, self::bytes($result->bytes), self::factsJson($result), $now);
            }
            $args[] = $id;
            $this->pdo->prepare('UPDATE streams SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($args);

            return true;
        });
    }

    /** Marks these streams' latest result as voided and due at once (the run guard threw their batch away). */
    public function markVoided(array $ids, int $nowMs): void
    {
        if ($ids === []) {
            return;
        }
        $in = implode(', ', array_fill(0, count($ids), '?'));
        $this->pdo
            ->prepare("UPDATE streams SET check_result = 'voided', next_check_at = ? WHERE id IN ({$in})")
            ->execute([Time::datetime($nowMs), ...array_values($ids)]);
    }

    /**
     * How far the first pass has got. A voided result (the run guard threw the check away) does not count as checked.
     *
     * @return array{eligible:int,checked:int,oldest_result_at:?string}
     */
    public function firstPass(): array
    {
        $row = $this->pdo
            ->query(
                "SELECT COUNT(*) AS eligible, SUM(check_result IS NOT NULL AND check_result <> 'voided') AS checked,
                        MIN(CASE WHEN check_result IS NOT NULL AND check_result <> 'voided' THEN last_checked_at END) AS oldest
                 FROM streams WHERE " . self::ELIGIBLE,
            )
            ->fetch();

        return ['eligible' => (int) $row['eligible'], 'checked' => (int) $row['checked'], 'oldest_result_at' => $row['oldest'] === null ? null : (string) $row['oldest']];
    }

    /** @return array<string,int> the latest result code of each eligible stream that has one, counted by code */
    public function resultCounts(): array
    {
        $counts = [];
        foreach ($this->pdo->query('SELECT check_result, COUNT(*) AS n FROM streams WHERE ' . self::ELIGIBLE . ' AND check_result IS NOT NULL GROUP BY check_result ORDER BY check_result')->fetchAll() as $r) {
            $counts[(string) $r['check_result']] = (int) $r['n'];
        }

        return $counts;
    }

    /**
     * Hosts with at least $minStreams eligible streams where more than half have a failing latest result (a failure is any
     * code but a pass or one of the no-information codes): the hosts that may be down or blocking this server.
     *
     * @return list<array{host:string,streams:int,failed:int}>
     */
    public function hostClusters(int $minStreams = 4): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT host, COUNT(*) AS streams,
                    SUM(check_result IS NOT NULL AND check_result NOT IN ('pass', 'host_guard', 'voided', 'skipped')) AS failed
             FROM streams WHERE " . self::ELIGIBLE . '
             GROUP BY host HAVING streams >= ? AND failed * 2 > streams
             ORDER BY failed DESC, host ASC',
        );
        $stmt->execute([$minStreams]);

        return array_map(static fn (array $r): array => ['host' => (string) $r['host'], 'streams' => (int) $r['streams'], 'failed' => (int) $r['failed']], $stmt->fetchAll());
    }

    /** @return list<array<string,mixed>> dead streams the owner pinned or made the default: the checker never removes them, the owner should know */
    public function flagged(): array
    {
        $stmt = $this->pdo->query('SELECT ' . self::READ . " FROM streams WHERE state = 'dead' AND (pinned = 1 OR is_default = 1) ORDER BY name ASC, id ASC");

        return array_map(self::typed(...), $stmt->fetchAll());
    }

    /** @return list<array{host:string,streams:int}> hosts whose results the host guard set aside, with how many streams */
    public function guardedHosts(): array
    {
        $rows = $this->pdo->query("SELECT host, COUNT(*) AS streams FROM streams WHERE check_result = 'host_guard' GROUP BY host ORDER BY streams DESC, host ASC")->fetchAll();

        return array_map(static fn (array $r): array => ['host' => (string) $r['host'], 'streams' => (int) $r['streams']], $rows);
    }

    /** @return list<array<string,mixed>> the streams held only because of their port */
    public function heldByPort(): array
    {
        $stmt = $this->pdo->query('SELECT ' . self::READ . " FROM streams WHERE state = 'held' AND state_reason = 'port' ORDER BY id");

        return array_map(self::typed(...), $stmt->fetchAll());
    }

    /**
     * Moves held-by-port streams to `held(awaiting_check)`: still hidden, now due for their first check. Only a row that is
     * still held for its port is touched. Returns how many moved.
     *
     * @param list<string> $ids
     */
    public function awaitCheck(array $ids, int $nowMs): int
    {
        $moved = 0;
        foreach (array_chunk($ids, 500) as $chunk) {
            $in = implode(', ', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare(
                "UPDATE streams SET state_reason = 'awaiting_check', state_changed_at = ?
                 WHERE state = 'held' AND state_reason = 'port' AND id IN ({$in})",
            );
            $stmt->execute([Time::datetime($nowMs), ...$chunk]);
            $moved += $stmt->rowCount();
        }

        return $moved;
    }

    private static function bytes(int $bytes): int
    {
        return min(max(0, $bytes), self::MAX_BYTES);
    }

    /** The facts as JSON text, or null when there are none (so a failing check keeps the facts an earlier one found). */
    private static function factsJson(CheckResult $result): ?string
    {
        return $result->facts === [] ? null : json_encode($result->facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
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
        foreach (['pinned', 'is_default', 'logo_tries', 'ever_passed', 'fail_days'] as $key) {
            if (array_key_exists($key, $row)) {
                $row[$key] = (int) $row[$key];
            }
        }

        return $row;
    }
}
