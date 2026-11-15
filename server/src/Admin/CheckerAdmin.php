<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use InvalidArgumentException;
use PDO;
use Prism\History\Checker\CheckerState;
use Prism\History\Checker\CheckResult;
use Prism\History\Checker\StateMachine;
use Prism\History\Clock;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Store\AuditStore;
use Prism\History\Store\StreamStore;
use Prism\History\Time;
use Throwable;

/**
 * The owner's view of the stream checker and its one big button. `status()` is everything the Health screen shows; `apply()`
 * turns the recorded first pass into states, once. A refused Apply changes nothing and says why; the write is one transaction
 * with its audit row, and the visitor snapshot is rewritten only after the commit (as in PlaylistAdmin).
 *
 * Every answer is an array: `ok` true (with the numbers), or `ok` false with `error` 'refused' and a `reason`.
 */
final class CheckerAdmin
{
    private const STALE_MS = 3 * 86_400_000;

    public function __construct(
        private PDO $pdo,
        private StreamStore $store,
        private AuditStore $audit,
        private CheckerState $state,
        private SnapshotWriter $snapshot,
        private Clock $clock,
        private int $dailyCapBytes,
        private int $firstPassCapBytes,
    ) {
    }

    /** @return array<string,mixed> */
    public function status(): array
    {
        $counts = $this->store->countsByState();
        ksort($counts);
        $applied = $this->state->appliedAt();

        return [
            'mode' => $applied === null ? 'shadow' : 'live',
            'applied_at' => $applied,
            'paused' => $this->state->isPaused(),
            'progress' => $this->store->firstPass(),
            'outcome' => $this->store->resultCounts(),
            'would_hide' => $applied === null ? $this->wouldHide() : 0,
            'counts' => $counts,
            'clusters' => $this->store->hostClusters(),
            'guarded_hosts' => $this->store->guardedHosts(),
            'flagged' => array_map(static fn (array $r): array => [
                'public_id' => (string) $r['public_id'],
                'name' => (string) $r['name'],
                'pinned' => $r['pinned'] === 1,
                'is_default' => $r['is_default'] === 1,
                'state' => (string) $r['state'],
            ], $this->store->flagged()),
            'budget' => [
                'bytes_today' => $this->state->bytesToday(),
                'daily_cap' => $this->dailyCapBytes,
                'first_pass_bytes' => $this->state->firstPassBytes(),
                'first_pass_cap' => $this->firstPassCapBytes,
            ],
            'last_stop' => $this->state->lastStop(),
        ];
    }

    /**
     * Applies the first pass: every checked stream's recorded result goes through the same state machine a live run uses, and
     * the checker is live from then on. Refused (nothing changes) while a stream has no result yet, when a result is more than
     * three days old, or when two thirds or more of the results are failures (then the server's network is the likely cause).
     * A second press changes nothing and says so.
     *
     * @return array<string,mixed>
     */
    public function apply(): array
    {
        if ($this->state->appliedAt() !== null) {
            return ['ok' => true, 'already' => true, 'hidden' => 0, 'listed' => $this->listedCount(), 'snapshot' => true];
        }
        $progress = $this->store->firstPass();
        if ($progress['checked'] < $progress['eligible']) {
            return self::refused('incomplete');
        }
        $now = $this->clock->nowMs();
        if ($progress['oldest_result_at'] !== null && Time::parseDatetime($progress['oldest_result_at']) < $now - self::STALE_MS) {
            return self::refused('stale');
        }
        $rows = $this->store->checkedForApply();
        $failures = 0;
        foreach ($rows as $row) {
            $result = self::resultOf($row);
            if ($result !== null && !$result->isPass() && !$result->isNoInformation()) {
                $failures++;
            }
        }
        if ($rows !== [] && $failures * 3 >= count($rows) * 2) {
            return self::refused('too_many_failures');
        }

        $hidden = 0;
        $this->store->transaction(function () use ($rows, $now, &$hidden): void {
            foreach ($rows as $row) {
                $result = self::resultOf($row);
                if ($result === null) {
                    continue;
                }
                $transition = StateMachine::next($row, $result, $now);
                $reason = $row['state_reason'] === null ? null : (string) $row['state_reason'];
                // $recordResult false: Apply applies what was recorded, it does not rewrite it.
                if (!$this->store->applyTransition((string) $row['id'], (string) $row['state'], $reason, $transition, $result, $now, false)) {
                    continue; // the owner changed it meanwhile: their change stands
                }
                if (in_array($row['state'], StreamStore::LISTED, true) && !in_array($transition->state, StreamStore::LISTED, true)) {
                    $hidden++;
                }
            }
            $this->audit->record('checker.apply', 'first pass', 'streams=' . count($rows) . '; hidden=' . $hidden);
            $this->state->markApplied();
        });

        return ['ok' => true, 'hidden' => $hidden, 'listed' => $this->listedCount(), 'snapshot' => $this->rewriteSnapshot()];
    }

    /** @return array{ok:true,paused:bool} */
    public function setPaused(bool $paused): array
    {
        $this->store->transaction(function () use ($paused): void {
            $this->state->setPaused($paused);
            $this->audit->record($paused ? 'checker.pause' : 'checker.resume', 'checker', 'paused=' . ($paused ? '1' : '0'));
        });

        return ['ok' => true, 'paused' => $paused];
    }

    /** How many streams that visitors can see now Apply would hide. */
    private function wouldHide(): int
    {
        $now = $this->clock->nowMs();
        $hide = 0;
        foreach ($this->store->checkedForApply() as $row) {
            $result = self::resultOf($row);
            if ($result === null) {
                continue;
            }
            $after = StateMachine::next($row, $result, $now)->state;
            if (in_array($row['state'], StreamStore::LISTED, true) && !in_array($after, StreamStore::LISTED, true)) {
                $hide++;
            }
        }

        return $hide;
    }

    private function listedCount(): int
    {
        $counts = $this->store->countsByState();

        return array_sum(array_map(static fn (string $state): int => $counts[$state] ?? 0, StreamStore::LISTED));
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

    /** @param array<string,mixed> $row */
    private static function resultOf(array $row): ?CheckResult
    {
        try {
            return new CheckResult((string) $row['check_result']);
        } catch (InvalidArgumentException) {
            return null;
        }
    }

    /** @return array{ok:false,error:'refused',reason:string} */
    private static function refused(string $reason): array
    {
        return ['ok' => false, 'error' => 'refused', 'reason' => $reason];
    }
}
