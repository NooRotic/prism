<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

use Prism\History\Clock;
use Prism\History\Store\AuditStore;
use Prism\History\Store\StreamStore;

/**
 * Streams stored as `held` because of their port, before the checker was allowed to use ports from 1024 up. The importer only
 * ever inserts, so it never revives them; this moves the ones the current rule allows to `held(awaiting_check)`. They stay hidden
 * from visitors until the checker's first pass has looked at them, so running this shows nothing new. Safe to run again.
 */
final class HeldRejudge
{
    public function __construct(private StreamStore $store, private AuditStore $audit, private Clock $clock)
    {
    }

    /** @return array{candidates:int,moved:int} a dry run ($apply false) only counts the candidates */
    public function run(bool $apply): array
    {
        $ids = [];
        foreach ($this->store->heldByPort() as $row) {
            if (ImportRules::stateOf((string) $row['url'])[0] === 'new') {
                $ids[] = (string) $row['id'];
            }
        }
        if (!$apply || $ids === []) {
            return ['candidates' => count($ids), 'moved' => 0];
        }

        $moved = $this->store->transaction(function () use ($ids): int {
            $moved = $this->store->awaitCheck($ids, $this->clock->nowMs());
            $this->audit->record('stream.rejudge', 'held ports', 'moved=' . $moved);

            return $moved;
        });

        return ['candidates' => count($ids), 'moved' => $moved];
    }
}
