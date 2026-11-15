<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use Prism\History\Time;

/**
 * The checker's rules as one pure function: a stream's row and one check result in, the row's next state out. Nothing
 * here reads a clock or touches storage, so a live run and the owner's Apply use exactly the same decisions.
 *
 * A stream that never passed is dead after one failed check; a stream that passed once gets the suspect grace and needs
 * failures on three different UTC days. Dead for 14 days with no pass is removed, except a pinned or default stream.
 * Results that carry no information, and states the checker does not own (the owner's removals, http, a refused port),
 * change nothing.
 */
final class StateMachine
{
    private const FAIL_DAYS_TO_DEAD = 3;
    private const REMOVE_AFTER_MS = 14 * 86_400_000;

    /** @param array<string,mixed> $row state, state_reason, ever_passed, fail_days, last_fail_day, pinned, is_default, state_changed_at */
    public static function next(array $row, CheckResult $result, int $nowMs): Transition
    {
        $state = (string) $row['state'];
        $reason = $row['state_reason'] === null ? null : (string) $row['state_reason'];
        $everPassed = (int) $row['ever_passed'] === 1;
        $failDays = (int) $row['fail_days'];
        $lastFailDay = isset($row['last_fail_day']) ? (string) $row['last_fail_day'] : null;

        $same = new Transition($state, $reason, $everPassed, $failDays, $lastFailDay, false);
        if ($result->isNoInformation() || !self::checkable($state, $reason)) {
            return $same;
        }
        $to = static fn (string $newState, ?string $newReason, bool $passed, int $days, ?string $day): Transition => new Transition(
            $newState,
            $newReason,
            $passed,
            $days,
            $day,
            $newState !== $state || $newReason !== $reason,
        );

        if ($result->isPass()) {
            return $to('working', null, true, 0, null);
        }

        if ($result->isNoCors() && !$everPassed) {
            // It answered, so it is not dead; it just cannot be played from PRISM's origin.
            return $state === 'unplayable' || $state === 'removed' ? $same : $to('unplayable', 'no_cors', false, $failDays, $lastFailDay);
        }

        // From here the result counts as a failure (a no-CORS answer from a stream that passed once included).
        switch ($state) {
            case 'new':
            case 'held':
                return $to('dead', 'never_passed', $everPassed, $failDays, $lastFailDay);
            case 'working':
            case 'suspect':
                $today = gmdate('Y-m-d', intdiv($nowMs, 1000));
                if ($lastFailDay !== $today) {
                    $failDays = min(255, $failDays + 1);
                    $lastFailDay = $today;
                }
                $failDays = max(1, $failDays);

                return $failDays >= self::FAIL_DAYS_TO_DEAD
                    ? $to('dead', 'failed_3_days', $everPassed, $failDays, $lastFailDay)
                    : $to('suspect', null, $everPassed, $failDays, $lastFailDay);
            case 'dead':
                return self::removable($row, $nowMs) ? $to('removed', 'dead_14_days', $everPassed, $failDays, $lastFailDay) : $same;
            default: // unplayable(no_cors), removed(dead_14_days): a failure changes nothing
                return $same;
        }
    }

    /** The states the checker owns; the owner's removals, http and refused ports are not among them. */
    private static function checkable(string $state, ?string $reason): bool
    {
        return match ($state) {
            'new', 'working', 'suspect', 'dead' => true,
            'unplayable' => $reason === 'no_cors',
            'held' => $reason === 'awaiting_check',
            'removed' => $reason === 'dead_14_days',
            default => false,
        };
    }

    /** Dead for 14 days or more, and not a stream the owner pinned or made the default. */
    private static function removable(array $row, int $nowMs): bool
    {
        if ((int) $row['pinned'] === 1 || (int) $row['is_default'] === 1) {
            return false;
        }
        $since = $row['state_changed_at'] ?? null;
        if ($since === null) {
            return false;
        }

        return $nowMs - Time::parseDatetime((string) $since) >= self::REMOVE_AFTER_MS;
    }
}
