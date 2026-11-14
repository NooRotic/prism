<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;
use Prism\History\Twitch\TwitchChannelInfo;
use Prism\History\Twitch\TwitchUser;

/** The channels the service tracks. Channels are keyed by Twitch id; the login is the latest known and is not unique. */
final class ChannelStore
{
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @return array<string,mixed>|null */
    public function findById(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM channels WHERE twitch_id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** The row for a login; when several rows share it (a rename, then the old login re-taken) the most recently visited one. @return array<string,mixed>|null */
    public function findByLogin(string $login): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM channels WHERE login = ? ORDER BY last_visited_at DESC, first_seen_at DESC LIMIT 1');
        $stmt->execute([strtolower($login)]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** Every channel id that has this login (a login can repeat after a rename), in id order. @return list<string> */
    public function idsByLogin(string $login): array
    {
        $stmt = $this->pdo->prepare('SELECT twitch_id FROM channels WHERE login = ? ORDER BY twitch_id');
        $stmt->execute([strtolower($login)]);

        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /** Starts tracking a channel. Safe to call twice, including from two requests at once: the second changes nothing. */
    public function insertTracked(TwitchUser $user, ?TwitchChannelInfo $info): void
    {
        $now = Time::datetime($this->clock->nowMs());
        $this->pdo
            ->prepare(
                "INSERT INTO channels
                    (twitch_id, login, display_name, avatar_url, broadcaster_type, account_created_at, language, category,
                     first_seen_at, last_visited_at, tracked_since, status, profile_checked_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tracking', ?)
                 ON DUPLICATE KEY UPDATE twitch_id = twitch_id",
            )
            ->execute([
                $user->id,
                strtolower($user->login),
                self::fit($user->displayName, 50) ?? '',
                self::avatar($user->avatarUrl),
                self::fit($user->broadcasterType, 12) ?? '',
                $user->createdAt,
                self::fit($info?->language, 8),
                self::fit($info?->category, 100),
                $now,
                $now,
                Time::date($this->clock->nowMs()),
                $now,
            ]);
    }

    /**
     * Writes a fresh Twitch profile: login (so renames are followed), name, picture, type, and, when channel
     * info came with it, language and category. A gone channel Twitch can find again becomes tracking; a
     * dormant one stays dormant, because only a visit wakes it.
     */
    public function applyProfile(string $id, TwitchUser $user, ?TwitchChannelInfo $info): void
    {
        $this->pdo
            ->prepare(
                "UPDATE channels SET
                    login = :login,
                    display_name = :display_name,
                    avatar_url = :avatar_url,
                    broadcaster_type = :broadcaster_type,
                    account_created_at = :created_at,
                    language = IF(:has_info = 1, :language, language),
                    category = IF(:has_info_too = 1, :category, category),
                    profile_checked_at = :checked_at,
                    status = IF(status = 'gone', 'tracking', status)
                 WHERE twitch_id = :id",
            )
            ->execute([
                'login' => strtolower($user->login),
                'display_name' => self::fit($user->displayName, 50) ?? '',
                'avatar_url' => self::avatar($user->avatarUrl),
                'broadcaster_type' => self::fit($user->broadcasterType, 12) ?? '',
                'created_at' => $user->createdAt,
                'has_info' => $info === null ? 0 : 1,
                'language' => self::fit($info?->language, 8),
                'has_info_too' => $info === null ? 0 : 1,
                'category' => self::fit($info?->category, 100),
                'checked_at' => Time::datetime($this->clock->nowMs()),
                'id' => $id,
            ]);
    }

    /** Records a visit: at most one write an hour per channel, except that a dormant channel wakes up at once. */
    public function touchVisit(string $id): void
    {
        $now = $this->clock->nowMs();
        $this->pdo
            ->prepare(
                "UPDATE channels
                 SET last_visited_at = :now, status = IF(status = 'dormant', 'tracking', status)
                 WHERE twitch_id = :id AND (status = 'dormant' OR last_visited_at <= :cutoff)",
            )
            ->execute([
                'now' => Time::datetime($now),
                'id' => $id,
                'cutoff' => Time::datetime($now - self::HOUR_MS),
            ]);
    }

    /** Notes that Twitch was asked about this channel just now, without changing anything else (for a gone channel Twitch still cannot find). */
    public function touchProfileCheck(string $id): void
    {
        $this->pdo
            ->prepare('UPDATE channels SET profile_checked_at = ? WHERE twitch_id = ?')
            ->execute([Time::datetime($this->clock->nowMs()), $id]);
    }

    public function markGone(string $id): void
    {
        $this->pdo->prepare("UPDATE channels SET status = 'gone' WHERE twitch_id = ?")->execute([$id]);
    }

    /** Stops refreshing channels nobody has visited for the tail window. Returns how many changed. */
    public function markDormantOlderThan(int $tailDays): int
    {
        $stmt = $this->pdo->prepare("UPDATE channels SET status = 'dormant' WHERE status = 'tracking' AND last_visited_at < ?");
        $stmt->execute([Time::datetime($this->clock->nowMs() - $tailDays * self::DAY_MS)]);

        return $stmt->rowCount();
    }

    public function countNewSince(string $utcDatetime): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM channels WHERE first_seen_at >= ?');
        $stmt->execute([$utcDatetime]);

        return (int) $stmt->fetchColumn();
    }

    public function isBlockedId(string $id): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM blocked_channels WHERE twitch_id = ?');
        $stmt->execute([$id]);

        return $stmt->fetchColumn() !== false;
    }

    public function isBlockedLogin(string $login): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM blocked_channels WHERE login = ? LIMIT 1');
        $stmt->execute([strtolower($login)]);

        return $stmt->fetchColumn() !== false;
    }

    public function block(string $id, string $login): void
    {
        $this->pdo
            ->prepare(
                'INSERT INTO blocked_channels (twitch_id, login, blocked_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE login = VALUES(login)',
            )
            ->execute([$id, strtolower($login), Time::datetime($this->clock->nowMs())]);
    }

    /**
     * Tracking channels that still need today's TT answer, never-fetched first and then the longest unrefreshed.
     *
     * @return list<array<string,mixed>>
     */
    public function trackingWithoutOkSnapshotFor(string $utcDate): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT c.*, (SELECT MAX(s.fetched_at) FROM snapshots s WHERE s.twitch_id = c.twitch_id) AS last_fetched_at
             FROM channels c
             WHERE c.status = 'tracking'
               AND NOT EXISTS (
                   SELECT 1 FROM snapshots s
                   WHERE s.twitch_id = c.twitch_id AND s.snap_date = ? AND s.tt_status = 'ok'
               )
             ORDER BY last_fetched_at IS NOT NULL, last_fetched_at ASC, c.twitch_id ASC",
        );
        $stmt->execute([$utcDate]);

        return $stmt->fetchAll();
    }

    /**
     * Channels whose login or display name contains the text (an empty text matches all), most recently visited
     * first, each with the status of its newest TwitchTracker snapshot. `%` and `_` in the text mean themselves.
     *
     * @return list<array{twitch_id:string,login:string,display_name:string,status:string,tracked_since:string,last_visited_at:string,tt_status:?string}>
     */
    public function search(string $text, int $limit): array
    {
        $like = '%' . addcslashes($text, '%_\\') . '%';
        $stmt = $this->pdo->prepare(
            'SELECT c.twitch_id, c.login, c.display_name, c.status, c.tracked_since, c.last_visited_at,
                    (SELECT s.tt_status FROM snapshots s WHERE s.twitch_id = c.twitch_id ORDER BY s.snap_date DESC LIMIT 1) AS tt_status
             FROM channels c
             WHERE (:empty = 1 OR c.login LIKE :like_login OR c.display_name LIKE :like_name)
             ORDER BY c.last_visited_at DESC, c.twitch_id ASC
             LIMIT :n',
        );
        $stmt->bindValue('empty', $text === '' ? 1 : 0, PDO::PARAM_INT);
        $stmt->bindValue('like_login', $like);
        $stmt->bindValue('like_name', $like);
        $stmt->bindValue('n', max(1, $limit), PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'twitch_id' => (string) $r['twitch_id'],
            'login' => (string) $r['login'],
            'display_name' => (string) $r['display_name'],
            'status' => (string) $r['status'],
            'tracked_since' => (string) $r['tracked_since'],
            'last_visited_at' => (string) $r['last_visited_at'],
            'tt_status' => $r['tt_status'] === null ? null : (string) $r['tt_status'],
        ], $stmt->fetchAll());
    }

    /** @return list<array{twitch_id:string,login:string,blocked_at:string}> newest first */
    public function blocked(int $limit): array
    {
        $stmt = $this->pdo->prepare('SELECT twitch_id, login, blocked_at FROM blocked_channels ORDER BY blocked_at DESC, twitch_id ASC LIMIT :n');
        $stmt->bindValue('n', max(1, $limit), PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'twitch_id' => (string) $r['twitch_id'],
            'login' => (string) $r['login'],
            'blocked_at' => (string) $r['blocked_at'],
        ], $stmt->fetchAll());
    }

    /** @return array{twitch_id:string,login:string,blocked_at:string}|null */
    public function findBlocked(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT twitch_id, login, blocked_at FROM blocked_channels WHERE twitch_id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : ['twitch_id' => (string) $row['twitch_id'], 'login' => (string) $row['login'], 'blocked_at' => (string) $row['blocked_at']];
    }

    /** Lifts a block; false when there was none. */
    public function unblock(string $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM blocked_channels WHERE twitch_id = ?');
        $stmt->execute([$id]);

        return $stmt->rowCount() > 0;
    }

    /** Deletes the channel; its snapshots and bio links go with it (foreign keys cascade). */
    public function remove(string $id): void
    {
        $this->pdo->prepare('DELETE FROM channels WHERE twitch_id = ?')->execute([$id]);
    }

    private static function fit(?string $text, int $max): ?string
    {
        return $text === null ? null : mb_substr($text, 0, $max);
    }

    /** A picture URL that does not fit its column is dropped, not cut: a cut URL points nowhere. */
    private static function avatar(?string $url): ?string
    {
        return $url !== null && strlen($url) <= 255 ? $url : null;
    }
}
