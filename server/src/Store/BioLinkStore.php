<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * A channel's YouTube and Kick links as read from its bio. Links are kept as history (first seen, last seen);
 * the current ones are those seen at or after the channel's latest profile read, so a bio that lost every
 * link shows none. Call sync after ChannelStore::applyProfile for the same refresh.
 */
final class BioLinkStore
{
    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @param list<array{platform:string,url:string}> $links */
    public function sync(string $id, array $links): void
    {
        $now = Time::datetime($this->clock->nowMs());
        $stmt = $this->pdo->prepare(
            'INSERT INTO bio_links (twitch_id, platform, url, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at)',
        );
        foreach ($links as $link) {
            $stmt->execute([$id, $link['platform'], $link['url'], $now, $now]);
        }
    }

    /** @return list<array{platform:string,url:string}> */
    public function current(string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT b.platform, b.url
             FROM bio_links b
             JOIN channels c ON c.twitch_id = b.twitch_id
             WHERE b.twitch_id = ? AND (c.profile_checked_at IS NULL OR b.last_seen_at >= c.profile_checked_at)
             ORDER BY b.id',
        );
        $stmt->execute([$id]);

        return array_map(
            static fn (array $row): array => ['platform' => (string) $row['platform'], 'url' => (string) $row['url']],
            $stmt->fetchAll(),
        );
    }
}
