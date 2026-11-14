<?php

declare(strict_types=1);

namespace Prism\History\Usage;

use Prism\History\RateCap;
use Prism\History\Store\UsageCounters;

/** Counts one page open under a section, within a global allowance per minute. */
final class HitRecorder
{
    public const OK = 'ok';
    public const BAD_SECTION = 'bad_section';
    public const CAPPED = 'capped';

    private const PER_MINUTE = 600;

    public function __construct(private UsageCounters $counters, private RateCap $cap)
    {
    }

    public function record(string $section): string
    {
        if (!Sections::isValid($section)) {
            return self::BAD_SECTION;
        }
        if (!$this->cap->allow('hit', self::PER_MINUTE)) {
            return self::CAPPED;
        }
        $this->counters->increment('hit:' . $section);

        return self::OK;
    }
}
