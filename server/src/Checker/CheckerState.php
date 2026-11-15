<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Clock;
use Prism\History\Store\JobState;
use Prism\History\Time;

/**
 * The checker's small bookkeeping in the key-value table: whether the owner has applied the first pass, the kill switch, how
 * many bytes it has downloaded (the first pass has a total of its own, every later UTC day has a count), and the last time a
 * worker stopped early. Counts and fixed words only.
 */
final class CheckerState
{
    private const APPLIED = 'checker_applied_at';
    private const PAUSED = 'checker_paused';
    private const DAY_PREFIX = 'checker_bytes_';
    private const FIRST_PASS = 'checker_bytes_first_pass';
    private const LAST_STOP = 'checker_last_stop';
    private const KEEP_DAYS = 14;

    public function __construct(private JobState $state, private Clock $clock)
    {
    }

    /** When the owner applied the first pass (`Y-m-d H:i:s` UTC), or null while the checker is still in its shadow run. */
    public function appliedAt(): ?string
    {
        return $this->state->get(self::APPLIED);
    }

    public function markApplied(): void
    {
        $this->state->set(self::APPLIED, Time::datetime($this->clock->nowMs()));
    }

    public function isPaused(): bool
    {
        return $this->state->get(self::PAUSED) === '1';
    }

    public function setPaused(bool $paused): void
    {
        $this->state->set(self::PAUSED, $paused ? '1' : '0');
    }

    public function bytesToday(): int
    {
        return (int) $this->state->get($this->dayKey());
    }

    public function firstPassBytes(): int
    {
        return (int) $this->state->get(self::FIRST_PASS);
    }

    /** Counts bytes read from the network: toward today, and, until Apply, toward the first pass's own total. */
    public function addBytes(int $bytes): void
    {
        $bytes = max(0, $bytes);
        $total = $this->state->add($this->dayKey(), $bytes);
        if ($this->appliedAt() === null) {
            $this->state->add(self::FIRST_PASS, $bytes);
        }
        if ($total === $bytes) {
            // The first bytes of a new day: forget the days nobody will ask about.
            $cutoff = self::DAY_PREFIX . gmdate('Ymd', intdiv($this->clock->nowMs(), 1000) - self::KEEP_DAYS * 86_400);
            $this->state->pruneBefore(self::DAY_PREFIX, $cutoff);
        }
    }

    /** Before Apply the first pass's total is held against its cap; after Apply today's total against the daily cap. */
    public function capReached(int $dailyCapBytes, int $firstPassCapBytes): bool
    {
        return $this->appliedAt() === null
            ? $this->firstPassBytes() >= $firstPassCapBytes
            : $this->bytesToday() >= $dailyCapBytes;
    }

    public function recordStop(string $reason): void
    {
        $this->state->set(self::LAST_STOP, json_encode(['reason' => substr($reason, 0, 20), 'at' => Time::datetime($this->clock->nowMs())], JSON_THROW_ON_ERROR));
    }

    /** @return array{reason:string,at:string}|null */
    public function lastStop(): ?array
    {
        $raw = $this->state->get(self::LAST_STOP);
        $decoded = $raw === null ? null : json_decode($raw, true);

        return is_array($decoded) && isset($decoded['reason'], $decoded['at']) ? ['reason' => (string) $decoded['reason'], 'at' => (string) $decoded['at']] : null;
    }

    private function dayKey(): string
    {
        return self::DAY_PREFIX . gmdate('Ymd', intdiv($this->clock->nowMs(), 1000));
    }
}
