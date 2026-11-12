<?php

declare(strict_types=1);

namespace Prism\History;

use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TrackerResult;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TwitchChannelInfo;
use Prism\History\Twitch\TwitchClient;
use Prism\History\Twitch\TwitchUnavailable;
use Prism\History\Twitch\TwitchUser;

/**
 * What happens when a PRISM page opens a channel: check the login, make sure the channel is real and tracked,
 * record the visit, and fetch TwitchTracker right away if the one TT rule allows, so a first visit shows
 * numbers at once. Nothing about the visitor is looked at or stored.
 */
final class VisitService
{
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;
    /** A stored profile older than this is re-read from Twitch before a visit is answered. */
    private const PROFILE_MAX_AGE_MS = 86_400_000;

    public function __construct(
        private Config $config,
        private ChannelStore $channels,
        private SnapshotStore $snapshots,
        private BioLinkStore $links,
        private TwitchClient $twitch,
        private TrackerClient $tracker,
        private TtGate $gate,
        private ChannelPayload $payload,
        private Clock $clock,
    ) {
    }

    public function visit(string $login): VisitResult
    {
        $login = strtolower(trim($login));
        if (preg_match('/^[a-z0-9_]{1,25}$/', $login) !== 1) {
            return new VisitResult(VisitResult::INVALID);
        }
        if (!$this->config->visitsEnabled()) {
            return new VisitResult(VisitResult::DISABLED);
        }
        if ($this->channels->isBlockedLogin($login)) {
            return new VisitResult(VisitResult::BLOCKED);
        }

        $row = $this->channels->findByLogin($login);
        if ($row === null && $this->newChannelCapReached()) {
            return new VisitResult(VisitResult::CAP); // saves a Twitch call when someone is flooding new names
        }

        if ($row !== null && !$this->needsResolve($row)) {
            $id = (string) $row['twitch_id'];
        } else {
            try {
                $user = $this->twitch->usersByLogin([$login])[$login] ?? null;
                $twitchDown = false;
            } catch (TwitchUnavailable) {
                $user = null;
                $twitchDown = true;
            }

            if ($user === null) {
                if ($row === null) {
                    return new VisitResult($twitchDown ? VisitResult::UNAVAILABLE : VisitResult::NOT_FOUND);
                }
                $id = (string) $row['twitch_id']; // a known channel Twitch cannot confirm right now: answer from the store
            } else {
                $stop = $this->adopt($user);
                if ($stop !== null) {
                    return new VisitResult($stop);
                }
                $id = $user->id; // the login may now belong to a different channel than the stored row
            }
        }

        $this->channels->touchVisit($id);
        $pending = $this->fetchTtIfAllowed($id);

        return new VisitResult(VisitResult::OK, $this->payload->build($id, 90, $pending ? 'pending' : null));
    }

    /**
     * Makes the Twitch user a tracked channel: inserts it if new, or refreshes (and renames, and revives) it.
     * Returns an outcome to stop with, or null to carry on.
     */
    private function adopt(TwitchUser $user): ?string
    {
        if ($this->channels->isBlockedId($user->id)) {
            return VisitResult::BLOCKED;
        }
        $info = $this->channelInfo($user->id);

        if ($this->channels->findById($user->id) === null) {
            if ($this->newChannelCapReached()) {
                return VisitResult::CAP;
            }
            $this->channels->insertTracked($user, $info);
        } else {
            $this->channels->applyProfile($user->id, $user, $info);
        }
        $this->links->sync($user->id, BioLinks::extract($user->description));

        return null;
    }

    private function channelInfo(string $id): ?TwitchChannelInfo
    {
        try {
            return $this->twitch->channelsById([$id])[$id] ?? null;
        } catch (TwitchUnavailable) {
            return null; // language and category are a nice-to-have
        }
    }

    /** @param array<string,mixed> $row */
    private function needsResolve(array $row): bool
    {
        if ($row['status'] === 'gone' || $row['profile_checked_at'] === null) {
            return true;
        }

        return $this->clock->nowMs() - Time::parseDatetime((string) $row['profile_checked_at']) >= self::PROFILE_MAX_AGE_MS;
    }

    private function newChannelCapReached(): bool
    {
        if (!$this->config->newChannelsEnabled()) {
            return true;
        }
        $now = $this->clock->nowMs();

        return $this->channels->countNewSince(Time::datetime($now - self::HOUR_MS)) >= $this->config->newPerHour()
            || $this->channels->countNewSince(Time::datetime($now - self::DAY_MS)) >= $this->config->newPerDay();
    }

    /** Fetches TwitchTracker if the one TT rule and the gate allow. Returns true when numbers were wanted but could not be had yet. */
    private function fetchTtIfAllowed(string $id): bool
    {
        if (!$this->config->ttEnabled()) {
            return false;
        }
        $today = Time::date($this->clock->nowMs());
        if (!TtPolicy::mayCall($this->snapshots, $id, $today, $this->config->untrackedRecheckDays())) {
            return false;
        }
        if (!$this->gate->acquire(false)) {
            return true;
        }

        $login = (string) ($this->channels->findById($id)['login'] ?? '');
        $result = $this->tracker->channelSummary($login);
        // Stamp the UTC date the answer arrived on: the gate may have waited past midnight.
        $date = Time::date($this->clock->nowMs());

        switch ($result->kind) {
            case TrackerResult::OK:
                $this->snapshots->upsert($id, $date, $result->summary ?? [], 'ok');

                return false;
            case TrackerResult::UNTRACKED:
                $this->snapshots->upsert($id, $date, [], 'untracked');

                return false;
            case TrackerResult::RATE_LIMITED:
                $this->gate->pauseForRestOfDay($result->retryAfter);

                return true;
            default:
                $this->snapshots->upsert($id, $date, [], 'error');

                return false;
        }
    }
}
