<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use PDO;
use Prism\History\Store\AuditStore;
use Prism\History\Store\ChannelStore;
use Throwable;

/**
 * The owner's two channel actions, each in one database transaction together with its audit row, so a change is
 * never recorded without happening and never happens without being recorded. This replaces bin/remove-channel.php.
 */
final class ChannelAdmin
{
    public function __construct(private PDO $pdo, private ChannelStore $channels, private AuditStore $audit)
    {
    }

    /** Deletes the channel (its snapshots and links go with it) and blocks its login. False, and nothing written, when the id is unknown. */
    public function removeAndBlock(string $twitchId): bool
    {
        $channel = $this->channels->findById($twitchId);
        if ($channel === null) {
            return false;
        }
        $login = (string) $channel['login'];

        $this->inTransaction(function () use ($twitchId, $login): void {
            $this->channels->block($twitchId, $login); // block first, so a visit in between cannot track it again
            $this->channels->remove($twitchId);
            $this->audit->record('channel.remove', $login, 'twitch_id=' . $twitchId);
        });

        return true;
    }

    /** Lifts a block. False, and nothing written, when that id is not blocked. */
    public function unblock(string $twitchId): bool
    {
        $blocked = $this->channels->findBlocked($twitchId);
        if ($blocked === null) {
            return false;
        }

        $this->inTransaction(function () use ($twitchId, $blocked): void {
            $this->channels->unblock($twitchId);
            $this->audit->record('channel.unblock', $blocked['login'], 'twitch_id=' . $twitchId);
        });

        return true;
    }

    private function inTransaction(callable $work): void
    {
        $this->pdo->beginTransaction();
        try {
            $work();
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
