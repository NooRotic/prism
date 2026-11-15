<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/**
 * Asks one question of a worker's recent checks: is the checker's own network down? About a third of streams do not play on a
 * normal day, so a share of failures cannot tell, and neither can one big host that is down. What does tell is many DIFFERENT
 * hosts failing to answer at the same time. So the guard takes one vote per host (a host's newest answer replaces its earlier
 * one) over a window of the last 50 hosts; when two thirds of them did not answer, the worker stops and voids the checks that
 * voted. The worker only feeds it streams that are expected to play, and only "no answer at all" counts as a failure.
 */
final class RunGuard
{
    /** @var array<string,array{failed:bool,id:string}> "h:<host>" => its vote, oldest first (a prefix, so a numeric host name is never an integer key) */
    private array $votes = [];

    public function __construct(private int $size = 50, private float $threshold = 2 / 3)
    {
    }

    public function record(string $host, bool $failed, string $id): void
    {
        $key = 'h:' . $host;
        unset($this->votes[$key]);
        $this->votes[$key] = ['failed' => $failed, 'id' => $id];
        if (count($this->votes) > $this->size) {
            array_shift($this->votes);
        }
    }

    public function tripped(): bool
    {
        if (count($this->votes) < $this->size) {
            return false;
        }
        $failures = count(array_filter($this->votes, static fn (array $v): bool => $v['failed']));

        return $failures >= (int) ceil($this->threshold * $this->size - 1e-9);
    }

    /**
     * The streams that cast the votes in the window, oldest first: the checks to void once the guard has tripped. Empty until
     * the window is full.
     *
     * @return list<string>
     */
    public function voters(): array
    {
        return count($this->votes) < $this->size ? [] : array_values(array_map(static fn (array $v): string => $v['id'], $this->votes));
    }
}
