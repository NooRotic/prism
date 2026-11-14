<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/** One stream as written in an M3U playlist. Text only: nothing here has been judged yet (see ImportRules). */
final class M3uEntry
{
    public function __construct(
        public readonly string $tvgId,
        public readonly string $logo,
        public readonly string $group,
        public readonly string $name,
        public readonly string $url,
        public readonly bool $hasPlayerOptions,
    ) {
    }
}
