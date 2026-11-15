<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/**
 * A real worker process. Its standard output is read when it is waited for; its error output goes to the null device, so a
 * worker that wrote more than a pipe buffer could never block on a launcher that is reading something else.
 */
final class ProcOpenWorker implements WorkerProcess
{
    /** @param resource $process @param resource $stdout */
    private function __construct(private $process, private $stdout)
    {
    }

    /** @param list<string> $command @return self|null null when the process could not be started */
    public static function start(array $command): ?self
    {
        $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
        $process = @proc_open($command, [1 => ['pipe', 'w'], 2 => ['file', $null, 'w']], $pipes);

        return is_resource($process) ? new self($process, $pipes[1]) : null;
    }

    public function wait(): array
    {
        $out = (string) stream_get_contents($this->stdout);
        fclose($this->stdout);

        return ['code' => proc_close($this->process), 'stdout' => $out];
    }
}
