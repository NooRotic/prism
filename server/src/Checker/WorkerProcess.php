<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/** A started checker worker process, which can be waited for. */
interface WorkerProcess
{
    /** Waits until it has finished. @return array{code:int,stdout:string} its exit code and what it printed */
    public function wait(): array;
}
