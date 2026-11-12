<?php

declare(strict_types=1);

namespace Prism\History\Tracker;

use PDO;
use Prism\History\Clock;
use Prism\History\Store\JobState;
use Prism\History\Time;

/**
 * The one door every TwitchTracker call goes through, from a visit or from the scheduled job. It spaces calls
 * (one shared turn in the database, so separate requests cannot burst), keeps a budget per scheduled run and per
 * UTC day, and holds all calls back after a 429. A refused call is never counted.
 */
final class TtGate
{
    private const PAUSED_UNTIL = 'tt_paused_until_ms';
    private const RUN_CALLS = 'tt_run_calls';
    private const DAY_MS = 86_400_000;

    public function __construct(
        private PDO $pdo,
        private Clock $clock,
        private Sleeper $sleeper,
        private JobState $state,
        private int $gapMs,
        private int $runBudget,
        private int $dayBudget,
        private int $maxWaitMs = 3000,
    ) {
    }

    /**
     * Waits for a turn, counts the call and returns true; or returns false (paused, a budget is spent, or no
     * turn within maxWaitMs) without counting anything. A scheduled run passes true so the run budget applies.
     */
    public function acquire(bool $forScheduledRun): bool
    {
        $now = $this->clock->nowMs();
        if ($now < (int) ($this->state->get(self::PAUSED_UNTIL) ?? '0')) {
            return false;
        }
        if ((int) ($this->state->get(self::dayKey($now)) ?? '0') >= $this->dayBudget) {
            return false;
        }
        if ($forScheduledRun && (int) ($this->state->get(self::RUN_CALLS) ?? '0') >= $this->runBudget) {
            return false;
        }
        if (!$this->claimTurn()) {
            return false;
        }

        // Count against the UTC day the call is made on, which may be later than the check if it had to wait.
        $this->state->incr(self::dayKey($this->clock->nowMs()));
        if ($forScheduledRun) {
            $this->state->incr(self::RUN_CALLS);
        }

        return true;
    }

    /** Holds every TT call back until the next UTC midnight, or until Retry-After if that is later. */
    public function pauseForRestOfDay(?int $retryAfterSeconds): void
    {
        $now = $this->clock->nowMs();
        $until = (intdiv($now, self::DAY_MS) + 1) * self::DAY_MS;
        if ($retryAfterSeconds !== null && $retryAfterSeconds > 0) {
            $until = max($until, $now + $retryAfterSeconds * 1000);
        }
        $until = max($until, (int) ($this->state->get(self::PAUSED_UNTIL) ?? '0'));

        $this->state->set(self::PAUSED_UNTIL, (string) $until);
    }

    /** True while a 429 pause is in force. */
    public function isPaused(): bool
    {
        return $this->clock->nowMs() < (int) ($this->state->get(self::PAUSED_UNTIL) ?? '0');
    }

    /** Starts a new scheduled run: its budget counts from zero again. */
    public function resetRun(): void
    {
        $this->state->delete(self::RUN_CALLS);
    }

    private function claimTurn(): bool
    {
        $claim = $this->pdo->prepare('UPDATE tt_gate SET last_call_ms = :now WHERE id = 1 AND last_call_ms <= :cutoff');
        $waited = 0;
        while (true) {
            $now = $this->clock->nowMs();
            $claim->execute(['now' => $now, 'cutoff' => $now - $this->gapMs]);
            if ($claim->rowCount() === 1) {
                return true;
            }
            $last = (int) $this->pdo->query('SELECT last_call_ms FROM tt_gate WHERE id = 1')->fetchColumn();
            $wait = max(1, $last + $this->gapMs - $now);
            if ($waited + $wait > $this->maxWaitMs) {
                return false;
            }
            $this->sleeper->sleepMs($wait);
            $waited += $wait;
        }
    }

    private static function dayKey(int $ms): string
    {
        return 'tt_calls:' . Time::date($ms);
    }
}
