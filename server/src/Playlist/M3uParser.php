<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/**
 * Reads the extended M3U format in one pass: an #EXTINF line, any further #EXT option lines, then the address line.
 * Everything it returns is plain text that has only been cleaned (valid UTF-8, no control characters, cut to length):
 * a name that looks like HTML stays HTML-looking text, and the page shows it as text.
 */
final class M3uParser
{
    private const NAME_MAX = 200;

    /** @return list<M3uEntry> */
    public static function parse(string $text): array
    {
        if (str_starts_with($text, "\xEF\xBB\xBF")) {
            $text = substr($text, 3);
        }
        $entries = [];
        $pending = null;
        foreach (preg_split('/\r\n|\n|\r/', $text) ?: [] as $raw) {
            $line = trim($raw);
            if ($line === '') {
                continue;
            }
            if (str_starts_with($line, '#EXTINF:')) {
                // A second #EXTINF before any address means the first had none: it is dropped.
                $pending = self::header(substr($line, strlen('#EXTINF:')));
                continue;
            }
            if ($line[0] === '#') {
                if ($pending !== null && self::isPlayerOption($line)) {
                    $pending['options'] = true;
                }
                continue;
            }
            if ($pending !== null) {
                $entries[] = new M3uEntry($pending['id'], $pending['logo'], $pending['group'], $pending['name'], $line, $pending['options']);
                $pending = null;
            }
            // An address with no #EXTINF in front of it is dropped.
        }

        return $entries;
    }

    /**
     * @return array{id:string,logo:string,group:string,name:string,options:bool}
     */
    private static function header(string $header): array
    {
        $cut = self::lastCommaOutsideQuotes($header);
        $attributeText = $cut === null ? $header : substr($header, 0, $cut);
        $name = $cut === null ? '' : substr($header, $cut + 1);

        $attributes = [];
        $options = false;
        if (preg_match_all('/([A-Za-z0-9_-]+)="([^"]*)"/', $attributeText, $m, PREG_SET_ORDER) > 0) {
            foreach ($m as $pair) {
                $key = strtolower($pair[1]);
                $attributes[$key] = $pair[2];
                // Request headers (a referrer, a user agent) cannot be sent by a browser: same class as #EXTVLCOPT.
                if (str_starts_with($key, 'http-')) {
                    $options = true;
                }
            }
        }

        return [
            'id' => self::clean($attributes['tvg-id'] ?? ''),
            'logo' => self::clean($attributes['tvg-logo'] ?? ''),
            'group' => self::clean($attributes['group-title'] ?? ''),
            'name' => mb_substr(self::clean($name), 0, self::NAME_MAX),
            'options' => $options,
        ];
    }

    private static function lastCommaOutsideQuotes(string $s): ?int
    {
        $inQuotes = false;
        $last = null;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $c = $s[$i];
            if ($c === '"') {
                $inQuotes = !$inQuotes;
            } elseif ($c === ',' && !$inQuotes) {
                $last = $i;
            }
        }

        return $last;
    }

    private static function isPlayerOption(string $line): bool
    {
        foreach (['#EXTVLCOPT', '#EXTHTTP', '#KODIPROP'] as $prefix) {
            if (str_starts_with($line, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /** Valid UTF-8, no control characters, no bidirectional overrides (they can disguise a name), trimmed. */
    private static function clean(string $s): string
    {
        $s = mb_scrub($s, 'UTF-8');
        $s = preg_replace('/[\p{Cc}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $s) ?? '';

        return trim($s);
    }
}
