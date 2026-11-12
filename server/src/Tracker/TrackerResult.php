<?php

declare(strict_types=1);

namespace Prism\History\Tracker;

/** What TwitchTracker's channel summary said. `summary` has the seven figures (int or null) only when the kind is OK. */
final class TrackerResult
{
    public const OK = 'ok';
    public const UNTRACKED = 'untracked';
    public const ERROR = 'error';
    public const RATE_LIMITED = 'rate_limited';

    /**
     * @param array{rank:?int,minutes_streamed:?int,avg_viewers:?int,max_viewers:?int,hours_watched:?int,followers:?int,followers_total:?int}|null $summary
     */
    public function __construct(
        public string $kind,
        public ?array $summary = null,
        public ?int $retryAfter = null,
    ) {
    }
}
