<?php

declare(strict_types=1);

namespace Prism\History;

/**
 * One line per event: counts and statuses only. Values that are not scalars are dropped, and so is any key
 * that looks like it could hold a secret, so a careless caller cannot put one in the log. Newlines in text are
 * flattened so a value cannot forge a second line. A log file that cannot be written never breaks a request.
 */
final class Logger
{
    private const SECRET_KEY = '/secret|pass|token|key|auth/i';

    public function __construct(private string $path, private Clock $clock)
    {
    }

    /** @param array<string,mixed> $counts */
    public function info(string $event, array $counts = []): void
    {
        $parts = [self::flat($event)];
        foreach ($counts as $key => $value) {
            if (!is_string($key) || !is_scalar($value) || preg_match(self::SECRET_KEY, $key) === 1) {
                continue;
            }
            $text = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
            $parts[] = self::flat($key) . '=' . self::flat($text);
        }
        $line = '[' . Time::datetime($this->clock->nowMs()) . 'Z] ' . implode(' ', $parts) . "\n";

        @file_put_contents($this->path, $line, FILE_APPEND | LOCK_EX);
    }

    private static function flat(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $text));
    }
}
