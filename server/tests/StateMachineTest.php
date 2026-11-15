<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Checker\CheckResult;
use Prism\History\Checker\StateMachine;
use Prism\History\Checker\Transition;

final class StateMachineTest extends TestCase
{
    private const NOW = '2026-11-15 12:00:00';

    private static function ms(string $utc): int
    {
        return strtotime($utc . ' UTC') * 1000;
    }

    /** @param array<string,mixed> $over */
    private static function row(array $over = []): array
    {
        return $over + [
            'state' => 'working',
            'state_reason' => null,
            'ever_passed' => 1,
            'fail_days' => 0,
            'last_fail_day' => null,
            'pinned' => 0,
            'is_default' => 0,
            'state_changed_at' => '2026-11-01 00:00:00',
        ];
    }

    private static function next(array $row, string $code, string $at = self::NOW): Transition
    {
        return StateMachine::next($row, new CheckResult($code), self::ms($at));
    }

    /** Applies a transition to a row, the way the store does, so a sequence of checks can be played. */
    private static function applied(array $row, Transition $t, string $at): array
    {
        if ($t->changed) {
            $row['state_changed_at'] = $at;
        }

        return [
            'state' => $t->state,
            'state_reason' => $t->reason,
            'ever_passed' => $t->everPassed ? 1 : 0,
            'fail_days' => $t->failDays,
            'last_fail_day' => $t->lastFailDay,
        ] + $row;
    }

    /** @return array<string,array{0:string,1:?string,2:int}> */
    public static function checkable(): array
    {
        return [
            'new' => ['new', null, 0],
            'suspect' => ['suspect', null, 1],
            'working' => ['working', null, 1],
            'dead never passed' => ['dead', 'never_passed', 0],
            'dead failed 3 days' => ['dead', 'failed_3_days', 1],
            'unplayable no cors' => ['unplayable', 'no_cors', 0],
            'held awaiting check' => ['held', 'awaiting_check', 0],
            'removed by the checker' => ['removed', 'dead_14_days', 0],
        ];
    }

    #[DataProvider('checkable')]
    public function testAPassMakesAnyCheckableStateWorkingAndResetsTheFailures(string $state, ?string $reason, int $everPassed): void
    {
        $t = self::next(self::row(['state' => $state, 'state_reason' => $reason, 'ever_passed' => $everPassed, 'fail_days' => 2, 'last_fail_day' => '2026-11-14']), 'pass');

        $this->assertSame('working', $t->state);
        $this->assertNull($t->reason);
        $this->assertTrue($t->everPassed);
        $this->assertSame(0, $t->failDays);
        $this->assertNull($t->lastFailDay);
        $this->assertSame($state !== 'working' || $reason !== null, $t->changed);
    }

    /** @return array<string,array{0:string,1:?string}> */
    public static function neverPassedFailing(): array
    {
        return [
            'new' => ['new', null],
            'held awaiting check' => ['held', 'awaiting_check'],
            'dead never passed' => ['dead', 'never_passed'],
        ];
    }

    #[DataProvider('neverPassedFailing')]
    public function testAStreamThatNeverPassedIsDeadAfterOneFailedCheck(string $state, ?string $reason): void
    {
        $t = self::next(self::row(['state' => $state, 'state_reason' => $reason, 'ever_passed' => 0, 'state_changed_at' => '2026-11-14 00:00:00']), 'unreachable');

        $this->assertSame('dead', $t->state);
        $this->assertSame('never_passed', $t->reason);
        $this->assertFalse($t->everPassed);
        $this->assertSame($state !== 'dead', $t->changed);
    }

    public function testAWorkingStreamThatFailsIsSuspectWithFailureDayOne(): void
    {
        $t = self::next(self::row(), 'http_status');

        $this->assertSame('suspect', $t->state);
        $this->assertNull($t->reason);
        $this->assertSame(1, $t->failDays);
        $this->assertSame('2026-11-15', $t->lastFailDay);
        $this->assertTrue($t->changed);
        $this->assertTrue($t->everPassed);
    }

    public function testSeveralFailuresOnTheSameUtcDayCountOnce(): void
    {
        $row = self::row(['state' => 'suspect', 'fail_days' => 1, 'last_fail_day' => '2026-11-15']);

        $t = self::next($row, 'unreachable', '2026-11-15 23:59:59');

        $this->assertSame('suspect', $t->state);
        $this->assertSame(1, $t->failDays);
        $this->assertFalse($t->changed);
    }

    public function testThreeDifferentUtcDaysOfFailureMakeItDead(): void
    {
        $row = self::row();
        $steps = [
            ['2026-11-15 10:00:00', 'suspect', 1],
            ['2026-11-15 16:00:00', 'suspect', 1],
            ['2026-11-16 02:00:00', 'suspect', 2],
            ['2026-11-17 00:00:01', 'dead', 3],
        ];
        foreach ($steps as [$at, $state, $days]) {
            $t = self::next($row, 'unreachable', $at);
            $this->assertSame($state, $t->state, $at);
            $this->assertSame($days, $t->failDays, $at);
            $row = self::applied($row, $t, $at);
        }

        $this->assertSame('failed_3_days', $row['state_reason']);
    }

    public function testNoCorsOnAStreamThatNeverPassedIsUnplayable(): void
    {
        foreach ([['new', null], ['held', 'awaiting_check'], ['dead', 'never_passed']] as [$state, $reason]) {
            $t = self::next(self::row(['state' => $state, 'state_reason' => $reason, 'ever_passed' => 0]), 'no_cors');

            $this->assertSame('unplayable', $t->state, $state);
            $this->assertSame('no_cors', $t->reason, $state);
            $this->assertTrue($t->changed, $state);
        }
    }

    public function testNoCorsOnAStreamThatPassedOnceIsAFailureWithTheSuspectGrace(): void
    {
        $t = self::next(self::row(), 'no_cors');

        $this->assertSame('suspect', $t->state);
        $this->assertSame(1, $t->failDays);

        $third = self::next(self::row(['state' => 'suspect', 'fail_days' => 2, 'last_fail_day' => '2026-11-14']), 'no_cors');
        $this->assertSame('dead', $third->state);
        $this->assertSame('failed_3_days', $third->reason);
    }

    public function testAnUnplayableNoCorsStreamStaysOnAnyFailureAndComesBackOnAPass(): void
    {
        $row = self::row(['state' => 'unplayable', 'state_reason' => 'no_cors', 'ever_passed' => 0]);

        foreach (['unreachable', 'no_cors', 'http_status'] as $code) {
            $t = self::next($row, $code);
            $this->assertSame('unplayable', $t->state, $code);
            $this->assertSame('no_cors', $t->reason, $code);
            $this->assertFalse($t->changed, $code);
        }
        $this->assertSame('working', self::next($row, 'pass')->state);
    }

    /** @return array<string,array{0:string}> */
    public static function noInformation(): array
    {
        return ['host_guard' => ['host_guard'], 'voided' => ['voided'], 'skipped' => ['skipped']];
    }

    #[DataProvider('noInformation')]
    public function testAResultWithNoInformationChangesNothing(string $code): void
    {
        foreach (self::checkable() as [$state, $reason, $everPassed]) {
            $row = self::row(['state' => $state, 'state_reason' => $reason, 'ever_passed' => $everPassed, 'fail_days' => 2, 'last_fail_day' => '2026-11-14', 'state_changed_at' => '2026-10-01 00:00:00']);

            $t = self::next($row, $code);

            $this->assertSame($state, $t->state, "$state $code");
            $this->assertSame($reason, $t->reason, "$state $code");
            $this->assertSame(2, $t->failDays, "$state $code");
            $this->assertSame('2026-11-14', $t->lastFailDay, "$state $code");
            $this->assertSame($everPassed === 1, $t->everPassed, "$state $code");
            $this->assertFalse($t->changed, "$state $code");
        }
    }

    public function testADeadStreamFailingAfterFourteenDaysIsRemoved(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => '2026-11-01 12:00:00']);

        $t = self::next($row, 'unreachable', '2026-11-15 12:00:00');

        $this->assertSame('removed', $t->state);
        $this->assertSame('dead_14_days', $t->reason);
        $this->assertTrue($t->changed);
    }

    public function testThirteenDaysAndTwentyThreeHoursIsNotEnough(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => '2026-11-01 12:00:00']);

        $this->assertSame('dead', self::next($row, 'unreachable', '2026-11-15 11:59:59')->state);
    }

    public function testAStreamThatNeverPassedIsRemovedAfterFourteenDaysToo(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'never_passed', 'ever_passed' => 0, 'state_changed_at' => '2026-10-20 00:00:00']);

        $this->assertSame('removed', self::next($row, 'segment_failed')->state);
    }

    public function testAPinnedOrDefaultStreamIsNeverAutoRemoved(): void
    {
        foreach (['pinned', 'is_default'] as $flag) {
            $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => '2026-10-01 00:00:00', $flag => 1]);

            $t = self::next($row, 'unreachable');

            $this->assertSame('dead', $t->state, $flag);
            $this->assertSame('failed_3_days', $t->reason, $flag);
            $this->assertFalse($t->changed, $flag);
        }
    }

    public function testAPassBeatsTheFourteenDayRemoval(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => '2026-10-01 00:00:00']);

        $this->assertSame('working', self::next($row, 'pass')->state);
    }

    public function testNoCorsOnADeadStreamThatPassedOnceCountsAsAFailureSoItCanBeRemoved(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => '2026-10-01 00:00:00']);

        $this->assertSame('removed', self::next($row, 'no_cors')->state);
    }

    public function testNoCorsOnADeadStreamThatNeverPassedMakesItUnplayableNotRemoved(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'never_passed', 'ever_passed' => 0, 'state_changed_at' => '2026-10-01 00:00:00']);

        $t = self::next($row, 'no_cors');

        $this->assertSame('unplayable', $t->state);
        $this->assertSame('no_cors', $t->reason);
    }

    public function testADeadStreamWithNoRecordedDateIsNotRemovedYet(): void
    {
        $row = self::row(['state' => 'dead', 'state_reason' => 'failed_3_days', 'state_changed_at' => null]);

        $this->assertSame('dead', self::next($row, 'unreachable')->state);
    }

    public function testARemovedStreamStaysRemovedOnAFailure(): void
    {
        $row = self::row(['state' => 'removed', 'state_reason' => 'dead_14_days', 'ever_passed' => 0]);

        $t = self::next($row, 'unreachable');

        $this->assertSame('removed', $t->state);
        $this->assertFalse($t->changed);
    }

    /** @return array<string,array{0:string,1:?string}> */
    public static function neverChecked(): array
    {
        return [
            'removed by the owner (no reason)' => ['removed', null],
            'removed by the owner (owner)' => ['removed', 'owner'],
            'unplayable http' => ['unplayable', 'http'],
            'held port' => ['held', 'port'],
        ];
    }

    #[DataProvider('neverChecked')]
    public function testStatesTheCheckerDoesNotTouchComeBackUnchangedForAnyCode(string $state, ?string $reason): void
    {
        foreach (CheckResult::CODES as $code) {
            $t = self::next(self::row(['state' => $state, 'state_reason' => $reason, 'ever_passed' => 0, 'pinned' => 0]), $code);

            $this->assertSame($state, $t->state, "$state/$reason $code");
            $this->assertSame($reason, $t->reason, "$state/$reason $code");
            $this->assertFalse($t->changed, "$state/$reason $code");
        }
    }
}
