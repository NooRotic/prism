<?php

declare(strict_types=1);

namespace Prism\History\Api;

/**
 * GET /api/streams: the visitor snapshot the playlist writes (streams.json and its gzip copy). The files sit outside
 * public/, so a plain-file request cannot bypass the origin check; this reads one and sends it with an ETag, so a
 * page that already has the current list gets a 304 with no body. Nothing is computed here: the writer did it all.
 */
final class StreamsController
{
    private const CACHE = 'public, max-age=300';

    public function __construct(private string $dataDir)
    {
    }

    public function handle(Request $request): ApiResponse
    {
        if ($request->method !== 'GET') {
            return ApiResponse::json(405, ['error' => 'method_not_allowed'], ['Cache-Control' => 'no-store', 'Allow' => 'GET, OPTIONS']);
        }

        $gzipped = false;
        $body = null;
        if (self::acceptsGzip($request->acceptEncoding)) {
            $body = self::read($this->dataDir . '/streams.json.gz');
            $gzipped = $body !== null;
        }
        $body ??= self::read($this->dataDir . '/streams.json');
        if ($body === null) {
            return ApiResponse::json(503, ['error' => 'not_ready'], ['Cache-Control' => 'no-store']);
        }

        $etag = '"' . substr(hash('sha256', $body), 0, 32) . '"';
        $headers = [
            'ETag' => $etag,
            'Cache-Control' => self::CACHE,
            'Vary' => 'Origin, Accept-Encoding',
        ];
        if (self::matches($request->ifNoneMatch, $etag)) {
            return new ApiResponse(304, $headers, '');
        }
        $headers += ['Content-Type' => 'application/json; charset=utf-8', 'X-Content-Type-Options' => 'nosniff'];
        if ($gzipped) {
            $headers['Content-Encoding'] = 'gzip';
        }

        return new ApiResponse(200, $headers, $body);
    }

    /** The file's bytes, or null when it is missing, not a file, unreadable or empty (all "not ready"). */
    private static function read(string $path): ?string
    {
        if (!is_file($path)) {
            return null;
        }
        $bytes = @file_get_contents($path);

        return $bytes === false || $bytes === '' ? null : $bytes;
    }

    /** True when the header lists gzip (any case) with a quality above zero. */
    private static function acceptsGzip(?string $header): bool
    {
        if ($header === null) {
            return false;
        }
        foreach (explode(',', $header) as $item) {
            $parts = array_map('trim', explode(';', $item));
            if (strtolower($parts[0]) !== 'gzip') {
                continue;
            }
            foreach (array_slice($parts, 1) as $param) {
                if (preg_match('/^q\s*=\s*([0-9.]+)$/i', $param, $m) === 1 && (float) $m[1] <= 0.0) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }

    /** If-None-Match: "*", or a list of tags (a weak "W/" prefix is ignored: a GET compares weakly). */
    private static function matches(?string $header, string $etag): bool
    {
        if ($header === null || trim($header) === '') {
            return false;
        }
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || (str_starts_with($candidate, 'W/') ? substr($candidate, 2) : $candidate) === $etag) {
                return true;
            }
        }

        return false;
    }
}
