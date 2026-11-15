<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/**
 * A rolling window over a worker's latest checks. About a third of checks fail on a normal day, so when two thirds or more of
 * a full window fail, the likely cause is the checker's own network, not the streams: the worker stops and throws that window
 * away. Pure: it only counts what it is told.
 */
final class RunGuard
{
    /** @var list<bool> true for a failed check, oldest first */
    private array $window = [];

    public function __construct(private int $size = 50, private float $threshold = 2 / 3)
    {
    }

    public function record(bool $failed): void
    {
        $this->window[] = $failed;
        if (count($this->window) > $this->size) {
            array_shift($this->window);
        }
    }

    public function tripped(): bool
    {
        if (count($this->window) < $this->size) {
            return false;
        }
        $failures = count(array_filter($this->window));

        return $failures >= (int) ceil($this->threshold * $this->size - 1e-9);
    }

    /** How many of the latest results to void: the whole window once the guard has tripped, else none. */
    public function lastResults(): int
    {
        return $this->tripped() ? $this->size : 0;
    }
}
