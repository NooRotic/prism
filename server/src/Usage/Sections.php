<?php

declare(strict_types=1);

namespace Prism\History\Usage;

/** The parts of PRISM a page open is counted under. The list is closed so the counter table stays tiny. */
final class Sections
{
    public const ALL = ['home', 'twitch', 'youtube', 'hls-dash', 'chat-popout', 'other'];

    public static function isValid(string $section): bool
    {
        return in_array($section, self::ALL, true);
    }
}
