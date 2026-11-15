<?php

declare(strict_types=1);

namespace Prism\History\Checker;

use InvalidArgumentException;

/**
 * What one check of one stream came to: a fixed code (never text from the other side, never an address), the bytes read
 * and the facts noticed. Three codes carry no information about the stream itself: the host guard set a failure aside,
 * a run was voided, or the host is one the checker never fetches.
 */
final class CheckResult
{
    public const CODES = [
        'pass', 'no_cors', 'unreachable', 'http_status', 'not_playlist', 'no_variant', 'no_segment', 'segment_failed',
        'too_large', 'insecure', 'blocked', 'redirects', 'host_guard', 'voided', 'skipped',
    ];

    public const NO_INFORMATION = ['host_guard', 'voided', 'skipped'];

    /** @param array<string,mixed> $facts */
    public function __construct(
        public readonly string $code,
        public readonly int $bytes = 0,
        public readonly array $facts = [],
    ) {
        if (!in_array($code, self::CODES, true)) {
            throw new InvalidArgumentException('Unknown check result code');
        }
    }

    public function isPass(): bool
    {
        return $this->code === 'pass';
    }

    public function isNoInformation(): bool
    {
        return in_array($this->code, self::NO_INFORMATION, true);
    }

    public function isNoCors(): bool
    {
        return $this->code === 'no_cors';
    }

    /** A check that reached a verdict against the stream: not a pass, not "no information", not the CORS case. */
    public function isFailure(): bool
    {
        return !$this->isPass() && !$this->isNoInformation() && !$this->isNoCors();
    }
}
