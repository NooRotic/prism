<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

/** What Twitch says about an access token: whose it is, which app issued it, what it may do, and how long it lives. */
final class TokenInfo
{
    /** @param list<string> $scopes */
    public function __construct(
        public readonly string $clientId,
        public readonly string $userId,
        public readonly string $login,
        public readonly array $scopes,
        public readonly int $expiresInSec,
    ) {
    }
}
