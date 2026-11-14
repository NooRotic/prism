<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/** Maps the country suffix of a playlist id (the "us" of "ChannelName.us@SD") to a flag-icons code. */
final class Countries
{
    /** Lower-case two letters, with the playlist's "uk" mapped to the standard "gb"; anything else is null. */
    public static function flagCode(?string $suffix): ?string
    {
        if ($suffix === null || preg_match('/^[A-Za-z]{2}$/D', $suffix) !== 1) {
            return null;
        }
        $code = strtolower($suffix);

        return $code === 'uk' ? 'gb' : $code;
    }
}
