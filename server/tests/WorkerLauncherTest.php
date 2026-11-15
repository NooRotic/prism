<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\ProcOpenWorker;
use Prism\History\Checker\WorkerLauncher;
use Prism\History\Checker\WorkerProcess;
use RuntimeException;

/** Starting several workers and waiting for every one of them, whatever goes wrong on the way. */
final class WorkerLauncherTest extends TestCase
{
    /** A worker that has "finished" with the given exit code and output, and notes that it was waited for. */
    private static function worker(int $code, string $out): WorkerProcess
    {
        return new class ($code, $out) implements WorkerProcess {
            public bool $waited = false;

            public function __construct(private int $code, private string $out)
            {
            }

            public function wait(): array
            {
                $this->waited = true;

                return ['code' => $this->code, 'stdout' => $this->out];
            }
        };
    }

    private const LINE = "checked=%d passed=%d failed=%d guarded=0 voided=0 bytes=%d\n";

    public function testItStartsEachSliceAndSumsTheirCounts(): void
    {
        $commands = [];
        $workers = [self::worker(0, sprintf(self::LINE, 10, 7, 3, 1000)), self::worker(0, sprintf(self::LINE, 5, 5, 0, 500))];
        $launcher = new WorkerLauncher('php', '/x/check-worker.php', function (array $command) use (&$commands, &$workers): ?WorkerProcess {
            $commands[] = $command;

            return array_shift($workers);
        });

        $r = $launcher->run(2, 300, true);

        $this->assertSame(['checked' => 15, 'passed' => 12, 'failed' => 3, 'guarded' => 0, 'voided' => 0, 'bytes' => 1500], $r['totals']);
        $this->assertSame([['php', '/x/check-worker.php', '0/2', '--limit=300', '--first-pass'], ['php', '/x/check-worker.php', '1/2', '--limit=300', '--first-pass']], $commands);
    }

    public function testTheFirstStopReasonIsReportedAndNoFlagIsSentWithoutFirstPass(): void
    {
        $commands = [];
        $workers = [
            self::worker(0, "checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0 stopped=run_guard\n"),
            self::worker(0, "checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0 stopped=cap\n"),
        ];
        $launcher = new WorkerLauncher('php', 'w.php', function (array $command) use (&$commands, &$workers): ?WorkerProcess {
            $commands[] = $command;

            return array_shift($workers);
        });

        $r = $launcher->run(2, 50, false);

        $this->assertSame('run_guard', $r['stopped']);
        $this->assertNotContains('--first-pass', $commands[0]);
    }

    public function testAWorkerThatCannotBeStartedLeavesTheEarlierOnesToFinishBeforeItThrows(): void
    {
        $started = [];
        $answers = [self::worker(0, sprintf(self::LINE, 1, 1, 0, 1)), self::worker(0, sprintf(self::LINE, 1, 1, 0, 1)), null];
        $launcher = new WorkerLauncher('php', 'w.php', function (array $command) use (&$answers, &$started): ?WorkerProcess {
            $next = array_shift($answers);
            if ($next !== null) {
                $started[] = $next;
            }

            return $next;
        });

        try {
            $launcher->run(4, 100, false);
            $this->fail('a worker that cannot start must fail the launch');
        } catch (RuntimeException) {
            $this->assertCount(2, $started, 'the fourth was never tried: the third could not be started');
            foreach ($started as $worker) {
                $this->assertTrue($worker->waited, 'a worker that is already running is waited for before the launch gives up, so its lock is not released under it');
            }
        }
    }

    public function testAWorkerThatFailsOrPrintsNothingUsableFailsTheLaunchAfterTheOthersHaveFinished(): void
    {
        foreach ([self::worker(1, ''), self::worker(0, 'garbage'), self::worker(0, '')] as $bad) {
            $good = self::worker(0, sprintf(self::LINE, 1, 1, 0, 1));
            $answers = [$bad, $good];
            $launcher = new WorkerLauncher('php', 'w.php', function (array $c) use (&$answers): ?WorkerProcess {
                return array_shift($answers);
            });

            try {
                $launcher->run(2, 100, false);
                $this->fail('a failed worker must fail the launch');
            } catch (RuntimeException) {
                $this->assertTrue($bad->waited);
                $this->assertTrue($good->waited, 'the healthy one was waited for too');
            }
        }
    }

    public function testARealProcessThatWritesALotToItsErrorOutputDoesNotHangTheLaunch(): void
    {
        $script = 'fwrite(STDERR, str_repeat("x", 300000)); echo "checked=1 passed=1 failed=0 guarded=0 voided=0 bytes=5\n";';

        $process = ProcOpenWorker::start([PHP_BINARY, '-r', $script]);

        $this->assertNotNull($process);
        $result = $process->wait();
        $this->assertSame(0, $result['code']);
        $this->assertSame("checked=1 passed=1 failed=0 guarded=0 voided=0 bytes=5\n", $result['stdout']);
    }

    public function testARealProcessThatCannotBeStartedGivesNull(): void
    {
        $this->assertNull(ProcOpenWorker::start(['/definitely/not/a/program/anywhere']));
    }
}
