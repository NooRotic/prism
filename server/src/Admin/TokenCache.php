<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * Remembers, for a while, that Twitch vouched for a token as the owner's, so most admin requests need no Twitch
 * call. Only the SHA-256 of the token is stored, never the token, and only owner tokens are ever remembered.
 */
final class TokenCache
{
    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    public function isOwner(string $token): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM admin_token_cache WHERE token_hash = ? AND expires_at > ?');
        $stmt->execute([hash('sha256', $token), Time::datetime($this->clock->nowMs())]);

        return $stmt->fetchColumn() !== false;
    }

    public function remember(string $token, int $ttlSeconds): void
    {
        $now = $this->clock->nowMs();
        $this->pdo->prepare('DELETE FROM admin_token_cache WHERE expires_at <= ?')->execute([Time::datetime($now)]);
        if ($ttlSeconds <= 0) {
            return;
        }
        $this->pdo
            ->prepare(
                'INSERT INTO admin_token_cache (token_hash, expires_at) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)',
            )
            ->execute([hash('sha256', $token), Time::datetime($now + $ttlSeconds * 1000)]);
    }
}
