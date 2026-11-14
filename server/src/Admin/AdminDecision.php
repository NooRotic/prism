<?php

declare(strict_types=1);

namespace Prism\History\Admin;

/** What the guard decided about one admin request. `recorded` is true only when a named refused-attempt row was written. */
final class AdminDecision
{
    public const OWNER = 'owner';
    public const NOT_FOUND = 'not_found';
    public const SIGNED_OUT = 'signed_out';
    public const REFUSED = 'refused';
    public const BUSY = 'busy';
    public const UNAVAILABLE = 'unavailable';

    private function __construct(public readonly string $kind, public readonly bool $recorded)
    {
    }

    public static function of(string $kind, bool $recorded = false): self
    {
        return new self($kind, $recorded);
    }

    public function isOwner(): bool
    {
        return $this->kind === self::OWNER;
    }
}
