<?php

declare(strict_types=1);

namespace Prism\History;

use InvalidArgumentException;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;

/**
 * The one JSON shape for a tracked channel, returned by both the visit endpoint and the read API.
 *
 * `latest` and `tt_status` describe the newest answer that was not an error, so one failed refresh does not
 * blank a channel whose numbers are a day old (`last_updated` says how old they are). Only when every answer so
 * far was an error is the status `error`; with no answers at all it is `none`. A caller that wanted TT numbers
 * but could not get a turn passes `pending` as the override.
 */
final class ChannelPayload
{
    public function __construct(
        private ChannelStore $channels,
        private SnapshotStore $snapshots,
        private BioLinkStore $links,
        private Clock $clock,
    ) {
    }

    /** @return array<string,mixed> */
    public function build(string $id, ?int $days = 90, ?string $ttStatusOverride = null): array
    {
        $channel = $this->channels->findById($id);
        if ($channel === null) {
            throw new InvalidArgumentException('Unknown channel');
        }

        $latest = $this->snapshots->latestNonError($id);
        $history = $this->snapshots->history($id, $days);

        if ($latest !== null) {
            $status = $latest['tt_status'];
        } else {
            $status = $this->snapshots->latest($id) === null ? 'none' : 'error';
        }

        return [
            'tracked' => true,
            'login' => (string) $channel['login'],
            'display_name' => (string) $channel['display_name'],
            'avatar_url' => $channel['avatar_url'],
            'broadcaster_type' => (string) $channel['broadcaster_type'],
            'language' => $channel['language'],
            'category' => $channel['category'],
            'tracked_since' => (string) $channel['tracked_since'],
            'last_updated' => $latest === null ? null : str_replace(' ', 'T', $latest['fetched_at']) . 'Z',
            'tt_status' => $ttStatusOverride ?? $status,
            'bio_links' => $this->links->current($id),
            'latest' => $latest === null ? null : self::row($latest),
            'history' => array_map(self::row(...), $history),
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function row(array $row): array
    {
        unset($row['fetched_at']);

        return $row;
    }
}
