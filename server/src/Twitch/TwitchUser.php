<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

/** One Twitch account as Helix describes it. `createdAt` is a UTC `Y-m-d H:i:s` string. */
final class TwitchUser
{
    public function __construct(
        public string $id,
        public string $login,
        public string $displayName,
        public ?string $avatarUrl,
        public string $broadcasterType,
        public ?string $createdAt,
        public string $description,
    ) {
    }
}
