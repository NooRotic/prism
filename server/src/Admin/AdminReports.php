<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use Prism\History\Clock;
use Prism\History\Config;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\AuditStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\JobState;
use Prism\History\Store\UsageCounters;
use Prism\History\Time;
use Prism\History\Tracker\TtGate;
use Prism\History\Usage\Sections;

/**
 * The numbers behind the admin screens, as plain arrays the controller turns into JSON. Reads only; counts and
 * statuses, never a secret and never a config value beyond the four non-secret limits `limits()` names.
 */
final class AdminReports
{
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;
    private const CHART_DAYS = 14;
    private const JOB_STALE_MS = 8 * self::HOUR_MS;

    public function __construct(
        private Config $config,
        private UsageCounters $counters,
        private AttemptStore $attempts,
        private AuditStore $audit,
        private JobState $state,
        private TtGate $gate,
        private ChannelStore $channels,
        private Clock $clock,
    ) {
    }

    /** @return array{tt_day_budget:int,tt_run_budget:int,new_per_day:int,tail_days:int} the only config values an admin answer may carry */
    public function limits(): array
    {
        return [
            'tt_day_budget' => $this->config->ttDayBudget(),
            'tt_run_budget' => $this->config->ttRunBudget(),
            'new_per_day' => $this->config->newPerDay(),
            'tail_days' => $this->config->tailDays(),
        ];
    }

    /** @return array<string,mixed> */
    public function overview(): array
    {
        $now = $this->clock->nowMs();
        $today = Time::date($now);
        $chart = [];
        foreach ($this->counters->forDays(self::CHART_DAYS, $this->hitKeys()) as $date => $counts) {
            $chart[] = ['date' => $date, 'pages' => array_sum($counts)];
        }
        $ttToday = $this->ttCallsOn($today);
        $namedRefused = $this->attempts->countSince(Time::datetime($now - 7 * self::DAY_MS));

        $needsAttention = [];
        if ($this->gate->isPaused()) {
            $needsAttention[] = 'tt_paused';
        }
        $lastRun = $this->lastRun();
        if ($lastRun === null || $now - (int) $lastRun['at_ms'] > self::JOB_STALE_MS) {
            $needsAttention[] = 'job_stale';
        }
        if ($ttToday * 5 > $this->config->ttDayBudget() * 4) {
            $needsAttention[] = 'tt_budget_80';
        }
        if ($namedRefused > 0) {
            $needsAttention[] = 'named_refused_7d';
        }

        return [
            'pages' => ['today' => $chart[self::CHART_DAYS - 1]['pages'], 'yesterday' => $chart[self::CHART_DAYS - 2]['pages']],
            'chart' => $chart,
            'new_channels' => ['last_24h' => $this->channels->countNewSince(Time::datetime($now - self::DAY_MS))],
            'tt' => ['today' => $ttToday, 'paused' => $this->gate->isPaused()],
            'refused' => ['named_7d' => $namedRefused, 'signed_out_today' => $this->counters->valueOn($today, 'signed_out')],
            'needs_attention' => $needsAttention,
        ];
    }

    /** @return array{days:list<array<string,int|string>>} */
    public function usage(int $days): array
    {
        $rows = [];
        foreach ($this->counters->forDays($days, $this->hitKeys()) as $date => $counts) {
            $row = ['date' => $date];
            foreach (Sections::ALL as $section) {
                $row[$section] = $counts['hit:' . $section];
            }
            $rows[] = $row;
        }

        return ['days' => $rows];
    }

    /** @return array<string,mixed> */
    public function tt(int $days): array
    {
        $now = $this->clock->nowMs();
        $calls = $this->state->getByPrefix('tt_calls:');
        $rows = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date = Time::date($now - $i * self::DAY_MS);
            $rows[] = ['date' => $date, 'calls' => (int) ($calls['tt_calls:' . $date] ?? 0)];
        }
        $until = $this->gate->pausedUntilMs();

        return [
            'days' => $rows,
            'paused_until' => $until === null ? null : Time::datetime($until),
            'last_run' => $this->lastRun(),
        ];
    }

    /** @return array<string,mixed> */
    public function security(): array
    {
        return [
            'signed_out_today' => $this->counters->valueOn(Time::date($this->clock->nowMs()), 'signed_out'),
            'attempts' => $this->attempts->recent(),
            'audit' => $this->audit->recent(50),
        ];
    }

    /** @return list<string> */
    private function hitKeys(): array
    {
        return array_map(static fn (string $section): string => 'hit:' . $section, Sections::ALL);
    }

    private function ttCallsOn(string $date): int
    {
        return (int) ($this->state->get('tt_calls:' . $date) ?? '0');
    }

    /** @return array<string,mixed>|null the scheduled job's last recorded run, or null when none is recorded or readable */
    private function lastRun(): ?array
    {
        $stored = json_decode($this->state->get('refresh_last_run') ?? '', true);

        return is_array($stored) && is_int($stored['at_ms'] ?? null) ? $stored : null;
    }
}
