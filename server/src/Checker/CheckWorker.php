<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Clock;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Store\StreamStore;

/**
 * One checker worker: it owns the streams whose host falls in its slice, checks the ones that are due, and writes one result
 * per stream as it goes. Before the owner applies the first pass it only RECORDS results (nothing visitors see changes);
 * after Apply each result moves the stream's state through the state machine, and a write that finds the row changed since it
 * was read (the owner removed, pinned or edited it) is dropped.
 *
 * A passing check and a result with no information are written at once. A failing one waits until the end of its batch, is
 * tried once more then (so a short outage has had time to clear), and is written after the host guard has looked at the whole
 * run: failures of streams that passed before are set aside (`host_guard`) on a host where more than half failed. The run
 * guard stops the worker, and voids the checks it made last, when two thirds of a window of its checks fail.
 *
 * Nothing it returns or records names a stream: counts and fixed codes only.
 */
final class CheckWorker
{
    private const LOGO_FILE = '/^[0-9a-f]{12}\.(?:png|jpg|gif|webp)$/D';

    public function __construct(
        private StreamStore $store,
        private StreamChecker $checker,
        private CheckerState $state,
        private Clock $clock,
        private SnapshotWriter $snapshot,
        private string $logoDir,
        private int $dailyCapBytes,
        private int $firstPassCapBytes,
        private ?HostPacer $pacer = null,
    ) {
    }

    /**
     * @param int $limit streams per batch; a first pass keeps taking batches until its slice has nothing due
     * @return array{checked:int,passed:int,failed:int,guarded:int,voided:int,stopped:?string,bytes:int}
     */
    public function run(int $worker, int $workers, int $limit, bool $firstPass): array
    {
        $this->pacer?->reset();
        $applied = $this->state->appliedAt() !== null;
        $out = ['checked' => 0, 'passed' => 0, 'failed' => 0, 'guarded' => 0, 'voided' => 0, 'stopped' => null, 'bytes' => 0];
        $run = new class {
            public RunGuard $guard;
            /** @var list<array{host:string,failed:bool}> */
            public array $tally = [];
            /** @var array<string,true> */
            public array $seen = [];
            /** @var list<string> */
            public array $recent = [];
            public bool $listingChanged = false;
        };
        $run->guard = new RunGuard();

        do {
            $stop = $this->stopReason();
            if ($stop === null) {
                $rows = array_values(array_filter(
                    $this->store->dueForCheck($worker, $workers, $limit, $this->clock->nowMs()),
                    static fn (array $r): bool => !isset($run->seen[(string) $r['id']]),
                ));
                if ($rows === []) {
                    break;
                }
                $stop = $this->batch(self::interleaved($rows), $applied, $run, $out);
            }
            if ($stop !== null) {
                $out['stopped'] = $stop;
                $this->state->recordStop($stop);
                break;
            }
        } while ($firstPass);

        if ($applied && $run->listingChanged) {
            $this->snapshot->write();
        }

        return $out;
    }

    /** @param list<array<string,mixed>> $rows @param array<string,mixed> $out @return string|null why the run must stop, or null */
    private function batch(array $rows, bool $applied, object $run, array &$out): ?string
    {
        $failed = [];
        foreach ($rows as $row) {
            if (($stop = $this->stopReason()) !== null) {
                return $stop;
            }
            $run->seen[(string) $row['id']] = true;
            $result = $this->checker->check($row);
            $this->spend($result, $out);

            $run->recent[] = (string) $row['id'];
            if (count($run->recent) > 50) {
                array_shift($run->recent);
            }
            if (!$result->isNoInformation()) {
                $run->guard->record($result->isFailure());
            }
            if ($run->guard->tripped()) {
                $this->store->markVoided($run->recent, $this->clock->nowMs());
                $out['voided'] = count($run->recent);

                return 'run_guard';
            }
            if (self::failing($result)) {
                $failed[] = $row;
                continue;
            }
            if (!$result->isNoInformation()) {
                $run->tally[] = ['host' => (string) $row['host'], 'failed' => false];
            }
            $this->write($row, $result, $applied, $run, $out);
        }

        // The second look at everything that failed, after the rest of the batch.
        $finals = [];
        foreach ($failed as $row) {
            if (($stop = $this->stopReason()) !== null) {
                return $stop;
            }
            $again = $this->checker->check($row);
            $this->spend($again, $out);
            if (!self::failing($again)) {
                if (!$again->isNoInformation()) {
                    $run->tally[] = ['host' => (string) $row['host'], 'failed' => false];
                }
                $this->write($row, $again, $applied, $run, $out);
                continue;
            }
            $run->tally[] = ['host' => (string) $row['host'], 'failed' => true];
            $finals[] = [$row, $again];
        }

        $guarded = HostGuard::guardedHosts($run->tally);
        foreach ($finals as [$row, $final]) {
            if ((int) $row['ever_passed'] === 1 && isset($guarded[(string) $row['host']])) {
                $final = new CheckResult('host_guard', $final->bytes);
            }
            $this->write($row, $final, $applied, $run, $out);
        }

        return null;
    }

    /** @param array<string,mixed> $row @param array<string,mixed> $out */
    private function write(array $row, CheckResult $result, bool $applied, object $run, array &$out): void
    {
        $id = (string) $row['id'];
        $now = $this->clock->nowMs();
        if (!$applied) {
            $this->store->recordShadow($id, $result, $now);
            self::count($result, $out);

            return;
        }

        $transition = StateMachine::next($row, $result, $now);
        $reason = $row['state_reason'] === null ? null : (string) $row['state_reason'];
        if (!$this->store->applyTransition($id, (string) $row['state'], $reason, $transition, $result, $now)) {
            return; // the row changed under us: the owner's change stands and this result is dropped
        }
        self::count($result, $out);
        if (in_array($row['state'], StreamStore::LISTED, true) !== in_array($transition->state, StreamStore::LISTED, true)) {
            $run->listingChanged = true;
        }
        if ($transition->state === 'removed' && $transition->changed) {
            $this->deleteLogo($row['logo_file'] ?? null);
        }
    }

    private function stopReason(): ?string
    {
        if ($this->state->isPaused()) {
            return 'paused';
        }

        return $this->state->capReached($this->dailyCapBytes, $this->firstPassCapBytes) ? 'cap' : null;
    }

    /** @param array<string,mixed> $out */
    private function spend(CheckResult $result, array &$out): void
    {
        $out['bytes'] += $result->bytes;
        $this->state->addBytes($result->bytes);
    }

    /** A result the worker tries a second time and counts as a failure: a failing check, or an answer without CORS. */
    private static function failing(CheckResult $result): bool
    {
        return $result->isFailure() || $result->isNoCors();
    }

    /** @param array<string,mixed> $out */
    private static function count(CheckResult $result, array &$out): void
    {
        $out['checked']++;
        if ($result->isPass()) {
            $out['passed']++;
        } elseif (self::failing($result)) {
            $out['failed']++;
        } elseif ($result->code === 'host_guard') {
            $out['guarded']++;
        }
    }

    /**
     * Round-robin across hosts, so one host's many streams are not taken back to back.
     *
     * @param list<array<string,mixed>> $rows
     * @return list<array<string,mixed>>
     */
    private static function interleaved(array $rows): array
    {
        $byHost = [];
        foreach ($rows as $row) {
            $byHost[(string) $row['host']][] = $row;
        }
        $ordered = [];
        while ($byHost !== []) {
            foreach (array_keys($byHost) as $host) {
                $ordered[] = array_shift($byHost[$host]);
                if ($byHost[$host] === []) {
                    unset($byHost[$host]);
                }
            }
        }

        return $ordered;
    }

    /** Only a file name of the shape the logo copier writes is ever deleted, and only inside the logo folder. */
    private function deleteLogo(mixed $file): void
    {
        if (is_string($file) && preg_match(self::LOGO_FILE, $file) === 1) {
            @unlink($this->logoDir . '/' . $file);
        }
    }
}
