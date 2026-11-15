<?php

declare(strict_types=1);

namespace Prism\History\Checker;

/**
 * Reads an HLS playlist just far enough for a check: which addresses it lists (variants of a master playlist, segments of a
 * media playlist), whether it is live, and a few facts. It never fetches anything. Facts come from somebody else's file, so
 * every text value is cut down to letters, digits, dots, dashes and underscores, at most 40 characters, at most 20 of a kind.
 */
final class PlaylistReader
{
    private const MAX_FACTS = 20;
    private const MAX_FACT_LENGTH = 40;

    /** True when the text is an M3U playlist: it starts with #EXTM3U, after an optional byte-order mark and blank space. */
    public static function isPlaylist(string $body): bool
    {
        return str_starts_with(ltrim($body, "\xEF\xBB\xBF \t\r\n"), '#EXTM3U');
    }

    /**
     * @return array{master:bool,variants:list<string>,segments:list<string>,live:bool,facts:array<string,mixed>}
     *         `live` is a media playlist with no #EXT-X-ENDLIST; a text that is not a playlist gives nothing at all
     */
    public static function parse(string $body): array
    {
        $none = ['master' => false, 'variants' => [], 'segments' => [], 'live' => false, 'facts' => []];
        if (!self::isPlaylist($body)) {
            return $none;
        }

        $variants = [];
        $segments = [];
        $codecs = [];
        $captions = [];
        $languages = [];
        $variantTags = 0;
        $ended = false;
        $expect = null;
        foreach (preg_split('/\R/', $body) ?: [] as $raw) {
            $line = trim($raw);
            if ($line === '') {
                continue;
            }
            if ($line[0] === '#') {
                if (str_starts_with($line, '#EXT-X-STREAM-INF:')) {
                    $variantTags++;
                    $expect = 'variant';
                    foreach (explode(',', (string) self::attribute($line, 'CODECS')) as $codec) {
                        self::add($codecs, self::clean($codec));
                    }
                } elseif (str_starts_with($line, '#EXTINF:')) {
                    $expect = 'segment';
                } elseif (str_starts_with($line, '#EXT-X-MEDIA:')) {
                    $type = (string) self::attribute($line, 'TYPE');
                    $language = self::clean((string) self::attribute($line, 'LANGUAGE'));
                    if ($type === 'AUDIO') {
                        self::add($languages, $language);
                    } elseif ($type === 'SUBTITLES' || $type === 'CLOSED-CAPTIONS') {
                        self::add($captions, $type . ':' . ($language === '' ? 'und' : $language));
                    }
                } elseif ($line === '#EXT-X-ENDLIST') {
                    $ended = true;
                }

                continue;
            }
            if ($expect === 'variant') {
                $variants[] = $line;
            } elseif ($expect === 'segment') {
                $segments[] = $line;
            }
            $expect = null;
        }

        $master = $variantTags > 0;

        return [
            'master' => $master,
            'variants' => $variants,
            'segments' => $segments,
            'live' => !$master && !$ended,
            'facts' => ['variants' => $variantTags, 'codecs' => $codecs, 'captions' => $captions, 'audio_languages' => $languages],
        ];
    }

    /** The value of one attribute of a tag line (quoted or not), or null. */
    private static function attribute(string $line, string $name): ?string
    {
        if (preg_match('/[:,]' . preg_quote($name, '/') . '=(?:"([^"]*)"|([^,]*))/', $line, $m) !== 1) {
            return null;
        }

        return $m[1] !== '' ? $m[1] : ($m[2] ?? '');
    }

    private static function clean(string $value): string
    {
        return substr((string) preg_replace('/[^A-Za-z0-9._-]/', '', $value), 0, self::MAX_FACT_LENGTH);
    }

    /** @param list<string> $list */
    private static function add(array &$list, string $value): void
    {
        if ($value !== '' && count($list) < self::MAX_FACTS && !in_array($value, $list, true)) {
            $list[] = $value;
        }
    }
}
