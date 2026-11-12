<?php

declare(strict_types=1);

namespace Prism\History;

use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TrackerResult;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TwitchClient;
use Prism\History\Twitch\TwitchUnavailable;
use Throwable;

/**
 * One scheduled run. It is small and safe to repeat: it only picks up tracking channels that still lack a good
 * (ok) snapshot for today, so a failed or unfinished channel is simply taken by the next run and a rerun the
 * same day does nothing. Only one run goes at a time (a second one stops at once as already_running). It stops
 * being refreshed for channels nobody has visited for the tail window (dormant), re-reads Twitch profiles
 * (renames, links, and channels Twitch no longer finds) at most every 12 hours, and asks TwitchTracker under the
 * one TT rule through the shared gate. One bad channel never stops the run, ten failures in a row do, and
 * Twitch being down does not stop the TT numbers. The log line holds counts only.
 */
final class RefreshJob
{
    /** A profile read less than this long ago is not read again by a run. */
    private const PROFILE_REFRESH_MS = 12 * 3_600_000;
    /** At most this many profiles are read per run (ten Helix calls). */
    private const MAX_PROFILES_PER_RUN = 1000;
    /** This many failed TT calls in a row end the run: TwitchTracker or the database is not answering. */
    private const MAX_CONSECUTIVE_FAILURES = 10;

    public function __construct(
        private Config $config,
        private ChannelStore $channels,
        private SnapshotStore $snapshots,
        private BioLinkStore $links,
        private TwitchClient $twitch,
        private TrackerClient $tracker,
        private TtGate $gate,
        private Logger $logger,
        private Clock $clock,
        private RunLock $lock,
    ) {
    }

    /** @return array{dormant:int,gone:int,profiles:int,tt_ok:int,tt_untracked:int,tt_error:int,tt_skipped:int,stopped_by:string} */
    public function run(): array
    {
        $counts = [
            'dormant' => 0,
            'gone' => 0,
            'profiles' => 0,
            'tt_ok' => 0,
            'tt_untracked' => 0,
            'tt_error' => 0,
            'tt_skipped' => 0,
            'stopped_by' => 'done',
        ];

        if (!$this->lock->acquire()) {
            $counts['stopped_by'] = 'already_running';

            return $this->finish($counts);
        }

        try {
            $this->gate->resetRun();
            $counts['dormant'] = $this->channels->markDormantOlderThan($this->config->tailDays());
            $due = $this->channels->trackingWithoutOkSnapshotFor(Time::date($this->clock->nowMs()));

            // Profiles are a nice-to-have: with Twitch down the TT numbers (which need only the stored login) still go on.
            $twitchDown = false;
            try {
                $this->refreshProfiles($due, $counts);
            } catch (TwitchUnavailable) {
                $twitchDown = true;
            }

            if ($this->config->ttEnabled()) {
                $this->fetchTt($due, $counts);
            }
            if ($twitchDown && $counts['stopped_by'] === 'done') {
                $counts['stopped_by'] = 'twitch_unavailable';
            }
        } finally {
            $this->lock->release();
        }

        return $this->finish($counts);
    }

    /**
     * @param list<array<string,mixed>> $due
     * @param array<string,int|string> $counts
     */
    private function refreshProfiles(array $due, array &$counts): void
    {
        $now = $this->clock->nowMs();
        $stale = array_values(array_filter($due, static function (array $row) use ($now): bool {
            return $row['profile_checked_at'] === null
                || $now - Time::parseDatetime((string) $row['profile_checked_at']) >= self::PROFILE_REFRESH_MS;
        }));
        $stale = array_slice($stale, 0, self::MAX_PROFILES_PER_RUN);
        if ($stale === []) {
            return;
        }

        $ids = array_map(static fn (array $row): string => (string) $row['twitch_id'], $stale);
        $users = $this->twitch->usersById($ids);
        try {
            $infos = $this->twitch->channelsById(array_keys($users));
        } catch (TwitchUnavailable) {
            $infos = []; // language and category are a nice-to-have
        }

        foreach ($ids as $id) {
            if (!isset($users[$id])) {
                $this->channels->markGone($id);
                $counts['gone']++;
                continue;
            }
            $user = $users[$id];
            $this->channels->applyProfile($id, $user, $infos[$id] ?? null);
            $this->links->sync($id, BioLinks::extract($user->description));
            $counts['profiles']++;
        }
    }

    /**
     * @param list<array<string,mixed>> $due
     * @param array<string,int|string> $counts
     */
    private function fetchTt(array $due, array &$counts): void
    {
        // Only channels the TT rule allows, so ones that were answered "untracked" a few days ago do not use up the budget.
        $eligible = [];
        foreach ($due as $row) {
            $current = $this->channels->findById((string) $row['twitch_id']);
            if ($current === null || $current['status'] !== 'tracking') {
                continue; // marked gone a moment ago
            }
            $today = Time::date($this->clock->nowMs());
            if (TtPolicy::mayCall($this->snapshots, (string) $current['twitch_id'], $today, $this->config->untrackedRecheckDays())) {
                $eligible[] = $current;
            }
        }

        $processed = 0;
        $failuresInARow = 0;
        foreach ($eligible as $channel) {
            if (!$this->gate->acquire(true)) {
                $counts['stopped_by'] = match ($this->gate->lastRefusal()) {
                    'paused' => 'rate_limited',
                    'timeout' => 'gate_busy',
                    default => 'budget',
                };
                break;
            }

            $id = (string) $channel['twitch_id'];
            // A visit, or an overlapping run, may have filed today's answer while this run waited for its turn: skip it.
            if ($this->snapshots->hasOkFor($id, Time::date($this->clock->nowMs()))) {
                continue;
            }
            $processed++;

            try {
                $result = $this->tracker->channelSummary((string) $channel['login']);
                $date = Time::date($this->clock->nowMs()); // the UTC day this answer arrived on

                if ($result->kind === TrackerResult::RATE_LIMITED) {
                    $this->gate->pauseForRestOfDay($result->retryAfter);
                    $counts['stopped_by'] = 'rate_limited';
                    break;
                }

                if ($result->kind === TrackerResult::OK) {
                    $this->snapshots->upsert($id, $date, $result->summary ?? [], 'ok');
                    $counts['tt_ok']++;
                    $failuresInARow = 0;
                } elseif ($result->kind === TrackerResult::UNTRACKED) {
                    $this->snapshots->upsert($id, $date, [], 'untracked');
                    $counts['tt_untracked']++;
                    $failuresInARow = 0;
                } else {
                    $this->snapshots->upsert($id, $date, [], 'error');
                    $counts['tt_error']++;
                    $failuresInARow++;
                }
            } catch (Throwable $e) {
                // One bad channel must not stop the run or wedge the queue behind it: note it, file an error row, go on.
                $counts['tt_error']++;
                $failuresInARow++;
                $this->logger->info('channel_error', ['type' => $e::class]);
                try {
                    $this->snapshots->upsert($id, Time::date($this->clock->nowMs()), [], 'error');
                } catch (Throwable) {
                    // even the error row could not be written; the channel is simply due again next run
                }
            }

            if ($failuresInARow >= self::MAX_CONSECUTIVE_FAILURES) {
                $counts['stopped_by'] = 'tt_unreachable';
                break;
            }
        }

        $counts['tt_skipped'] = count($eligible) - $processed;
    }

    /**
     * @param array<string,int|string> $counts
     * @return array{dormant:int,gone:int,profiles:int,tt_ok:int,tt_untracked:int,tt_error:int,tt_skipped:int,stopped_by:string}
     */
    private function finish(array $counts): array
    {
        $this->logger->info('refresh', $counts);

        return $counts;
    }
}
