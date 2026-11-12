<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

/** A channel's broadcast settings: its language and its current category. An empty value from Twitch is null here. */
final class TwitchChannelInfo
{
    public function __construct(
        public string $id,
        public ?string $language,
        public ?string $category,
    ) {
    }
}
