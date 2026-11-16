<?php

declare(strict_types=1);

namespace Prism\History\Usage;

use Prism\History\RateCap;
use Prism\History\Store\FavoriteStore;
use Prism\History\Store\StreamStore;

/**
 * Counts one star or un-star for a stream that is on the public list, within a global allowance per minute. It never
 * looks at who is asking: the caller's browser keeps its own set of starred streams.
 */
final class FavoriteRecorder
{
    public const OK = 'ok';
    public const BAD_ID = 'bad_id';
    public const NOT_LISTED = 'not_listed';
    public const CAPPED = 'capped';

    private const PER_MINUTE = 300;

    public function __construct(private FavoriteStore $favorites, private StreamStore $streams, private RateCap $cap)
    {
    }

    public function record(string $publicId, bool $on): string
    {
        if (preg_match('/^[0-9a-f]{12}$/', $publicId) !== 1) {
            return self::BAD_ID;
        }
        $row = $this->streams->findByPublicId($publicId);
        if ($row === null || !in_array($row['state'], StreamStore::LISTED, true)) {
            return self::NOT_LISTED; // a hidden or unknown stream gets no count, so it cannot be inflated
        }
        if (!$this->cap->allow('favorite', self::PER_MINUTE)) {
            return self::CAPPED;
        }
        $on ? $this->favorites->add($publicId) : $this->favorites->remove($publicId);

        return self::OK;
    }
}
