<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/**
 * What the import rules decided about one playlist entry. A rejected entry carries only its reason; an accepted one
 * carries everything the store needs (state is "new", or "unplayable" / "held" with the reason it is not shown).
 */
final class ImportDecision
{
    /** @param list<string> $groups */
    public function __construct(
        public readonly string $verdict,
        public readonly ?string $state,
        public readonly ?string $reason,
        public readonly ?string $normalisedUrl,
        public readonly string $kind,
        public readonly ?string $country,
        public readonly array $groups,
    ) {
    }
}
