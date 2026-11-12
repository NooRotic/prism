<?php

declare(strict_types=1);

namespace Prism\History;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

/** Every stored time is UTC. These helpers are the only place milliseconds become database strings. */
final class Time
{
    /** `Y-m-d H:i:s` in UTC for a millisecond timestamp. */
    public static function datetime(int $ms): string
    {
        return gmdate('Y-m-d H:i:s', intdiv($ms, 1000));
    }

    /** `Y-m-d` in UTC for a millisecond timestamp. The date rolls over at UTC midnight. */
    public static function date(int $ms): string
    {
        return gmdate('Y-m-d', intdiv($ms, 1000));
    }

    /** Milliseconds for a `Y-m-d H:i:s` UTC string. */
    public static function parseDatetime(string $utc): int
    {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $utc, new DateTimeZone('UTC'));
        $errors = DateTimeImmutable::getLastErrors();
        if ($parsed === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
            throw new InvalidArgumentException('Not a UTC datetime');
        }

        return $parsed->getTimestamp() * 1000;
    }
}
