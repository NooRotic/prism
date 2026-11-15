<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use RuntimeException;

/**
 * Starts the worker processes of one launch, one per slice, and waits for EVERY one that was started, whatever goes wrong on
 * the way (a worker that cannot be started, one that fails, one that prints nothing usable). The launcher holds the launch
 * lock until this returns, so a worker must never be left running when it does: a next launch would start a second generation
 * over the same hosts.
 */
final class WorkerLauncher
{
    private const KEYS = ['checked', 'passed', 'failed', 'guarded', 'voided', 'bytes'];
    private const LINE = '/^checked=(\d+) passed=(\d+) failed=(\d+) guarded=(\d+) voided=(\d+) bytes=(\d+)(?: stopped=([a-z_]+))?$/m';

    /** @var callable(list<string>):?WorkerProcess */
    private $start;

    /** @param (callable(list<string>):?WorkerProcess)|null $start how a worker is started; real processes when null */
    public function __construct(private string $php, private string $workerScript, ?callable $start = null)
    {
        $this->start = $start ?? ProcOpenWorker::start(...);
    }

    /**
     * @return array{totals:array<string,int>,stopped:?string} the counts of every worker added up, and the first reason a worker stopped early
     * @throws RuntimeException after every started worker has finished, when any could not be started or did not finish well
     */
    public function run(int $workers, int $batch, bool $firstPass): array
    {
        $running = [];
        $failed = false;
        for ($k = 0; $k < $workers; $k++) {
            $command = [$this->php, $this->workerScript, $k . '/' . $workers, '--limit=' . $batch];
            if ($firstPass) {
                $command[] = '--first-pass';
            }
            $worker = ($this->start)($command);
            if ($worker === null) {
                $failed = true;
                break;
            }
            $running[] = $worker;
        }

        $totals = array_fill_keys(self::KEYS, 0);
        $stopped = null;
        foreach ($running as $worker) {
            $result = $worker->wait();
            if ($result['code'] !== 0 || preg_match(self::LINE, $result['stdout'], $m) !== 1) {
                $failed = true;
                continue;
            }
            foreach (self::KEYS as $i => $key) {
                $totals[$key] += (int) $m[$i + 1];
            }
            $stopped ??= $m[7] ?? null;
        }
        if ($failed) {
            throw new RuntimeException('a worker failed');
        }

        return ['totals' => $totals, 'stopped' => $stopped];
    }
}
