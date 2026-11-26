<?php

declare(strict_types=1);

namespace Prism\History\Api;

use Prism\History\Admin\AdminController;
use Prism\History\ChannelPayload;
use Prism\History\Config;
use Prism\History\Logger;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\FavoriteStore;
use Prism\History\Tv\TvSettings;
use Prism\History\Usage\FavoriteRecorder;
use Prism\History\Usage\HitRecorder;
use Prism\History\VisitResult;
use Prism\History\VisitService;
use Throwable;

/**
 * The whole HTTP API: POST /api/visit, GET /api/channel, POST /api/hit, GET /api/streams, GET /api/tv and the admin routes, plus the
 * CORS preflight.
 *
 * A request that carries an Origin which is not in the allow-list is refused. That only stops other websites'
 * browsers (anything can forge the header); the real protection is the Twitch check and the caps. A request
 * with no Origin is processed. Answers never include a config value, and an unexpected error is logged as its
 * class name only.
 */
final class Router
{
    private const MAX_BODY_BYTES = 1024;
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(
        private Config $config,
        private VisitService $visits,
        private ChannelStore $channels,
        private ChannelPayload $payload,
        private Logger $logger,
        private HitRecorder $hits,
        private AdminController $admin,
        private StreamsController $streams,
        private FavoriteRecorder $favoriteRecorder,
        private FavoriteStore $favorites,
        private TvSettings $tv,
    ) {
    }

    public function handle(Request $request): ApiResponse
    {
        try {
            return $this->dispatch($request);
        } catch (Throwable $e) {
            $this->logger->info('error', ['type' => $e::class]);

            return $this->withCors($request, ApiResponse::json(500, ['error' => 'server'], self::NO_STORE));
        }
    }

    private function dispatch(Request $request): ApiResponse
    {
        if ($request->origin !== null && !in_array($request->origin, $this->config->allowedOrigins(), true)) {
            return ApiResponse::json(403, ['error' => 'forbidden_origin'], self::NO_STORE);
        }

        if ($request->method === 'OPTIONS') {
            return $this->withCors($request, new ApiResponse(204, self::NO_STORE + [
                'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
                // Only the admin paths take a header beyond Content-Type, so a public page can never send Authorization.
                'Access-Control-Allow-Headers' => str_starts_with(rtrim($request->path, '/') . '/', '/api/admin/')
                    ? 'Authorization, Content-Type'
                    : 'Content-Type',
                'Access-Control-Max-Age' => '600',
            ], ''));
        }

        $path = rtrim($request->path, '/');

        if (str_starts_with($path . '/', '/api/admin/')) {
            return $this->withCors($request, $this->admin->handle($request)); // authorised there, owner only
        }

        return $this->withCors($request, match ($path) {
            '/api/visit' => $request->method === 'POST' ? $this->visit($request) : $this->notAllowed('POST, OPTIONS'),
            '/api/channel' => $request->method === 'GET' ? $this->channel($request) : $this->notAllowed('GET, OPTIONS'),
            '/api/hit' => $request->method === 'POST' ? $this->hit($request) : $this->notAllowed('POST, OPTIONS'),
            '/api/streams' => $this->streams->handle($request), // answers its own 405: GET and OPTIONS only
            '/api/favorite' => $request->method === 'POST' ? $this->favorite($request) : $this->notAllowed('POST, OPTIONS'),
            '/api/favorites' => $request->method === 'GET' ? $this->favoriteCounts() : $this->notAllowed('GET, OPTIONS'),
            '/api/tv' => $request->method === 'GET' ? $this->tvSettings() : $this->notAllowed('GET, OPTIONS'),
            default => ApiResponse::json(404, ['error' => 'not_found'], self::NO_STORE),
        });
    }

    private function visit(Request $request): ApiResponse
    {
        if (strlen($request->body) > self::MAX_BODY_BYTES) {
            return ApiResponse::json(413, ['error' => 'too_large'], self::NO_STORE);
        }
        $data = json_decode($request->body, true);
        if (!is_array($data) || !isset($data['login']) || !is_string($data['login'])) {
            return ApiResponse::json(400, ['error' => 'bad_request'], self::NO_STORE);
        }

        $result = $this->visits->visit($data['login']);

        return match ($result->outcome) {
            VisitResult::OK => ApiResponse::json(200, $result->payload ?? [], self::NO_STORE),
            VisitResult::INVALID => ApiResponse::json(400, ['error' => 'bad_login'], self::NO_STORE),
            VisitResult::DISABLED => ApiResponse::json(503, ['error' => 'disabled'], self::NO_STORE),
            VisitResult::UNAVAILABLE => ApiResponse::json(503, ['error' => 'unavailable'], self::NO_STORE),
            default => ApiResponse::json(404, ['tracked' => false], self::NO_STORE), // blocked, not found, cap reached
        };
    }

    /** One page open, counted under a section. The body is JSON sent as plain text (no preflight); nothing about the sender is kept. */
    private function hit(Request $request): ApiResponse
    {
        if (strlen($request->body) > self::MAX_BODY_BYTES) {
            return ApiResponse::json(413, ['error' => 'too_large'], self::NO_STORE);
        }
        $data = json_decode($request->body, true);
        if (!is_array($data) || !isset($data['section']) || !is_string($data['section'])) {
            return ApiResponse::json(400, ['error' => 'bad_request'], self::NO_STORE);
        }

        return match ($this->hits->record($data['section'])) {
            HitRecorder::OK => new ApiResponse(204, self::NO_STORE, ''),
            HitRecorder::BAD_SECTION => ApiResponse::json(400, ['error' => 'bad_section'], self::NO_STORE),
            default => ApiResponse::json(429, ['error' => 'busy'], self::NO_STORE + ['Retry-After' => '60']),
        };
    }

    /** One star or un-star for a listed stream. JSON sent as plain text (no preflight); nothing about the sender is kept. */
    private function favorite(Request $request): ApiResponse
    {
        if (strlen($request->body) > self::MAX_BODY_BYTES) {
            return ApiResponse::json(413, ['error' => 'too_large'], self::NO_STORE);
        }
        $data = json_decode($request->body, true);
        if (!is_array($data) || !isset($data['id']) || !is_string($data['id']) || !isset($data['on']) || !is_bool($data['on'])) {
            return ApiResponse::json(400, ['error' => 'bad_request'], self::NO_STORE);
        }

        return match ($this->favoriteRecorder->record($data['id'], $data['on'])) {
            FavoriteRecorder::OK => new ApiResponse(204, self::NO_STORE, ''),
            FavoriteRecorder::BAD_ID => ApiResponse::json(400, ['error' => 'bad_id'], self::NO_STORE),
            FavoriteRecorder::NOT_LISTED => ApiResponse::json(404, ['error' => 'not_found'], self::NO_STORE),
            default => ApiResponse::json(429, ['error' => 'busy'], self::NO_STORE + ['Retry-After' => '60']),
        };
    }

    /** The star counts above zero for the streams on the public list: {"v":1,"counts":{"<id>":n}}. Cached for a minute. */
    private function favoriteCounts(): ApiResponse
    {
        $counts = $this->favorites->listedCounts();

        return ApiResponse::json(200, ['v' => 1, 'counts' => (object) $counts], ['Cache-Control' => 'public, max-age=60']);
    }

    private function channel(Request $request): ApiResponse
    {
        $login = $request->query['login'] ?? null;
        if (!is_string($login) || preg_match('/^[A-Za-z0-9_]{1,25}$/', $login) !== 1) {
            return ApiResponse::json(400, ['error' => 'bad_login'], self::NO_STORE);
        }

        $daysParam = $request->query['days'] ?? null;
        if ($daysParam === null) {
            $days = 90;
        } elseif ($daysParam === 'all') {
            $days = null;
        } elseif (is_string($daysParam) && ctype_digit($daysParam) && (int) $daysParam >= 1 && (int) $daysParam <= 3650) {
            $days = (int) $daysParam;
        } else {
            return ApiResponse::json(400, ['error' => 'bad_days'], self::NO_STORE);
        }

        $login = strtolower($login);
        $row = $this->channels->isBlockedLogin($login) ? null : $this->channels->findByLogin($login);
        if ($row === null) {
            return ApiResponse::json(404, ['tracked' => false], self::NO_STORE);
        }

        return ApiResponse::json(200, $this->payload->build((string) $row['twitch_id'], $days), ['Cache-Control' => 'public, max-age=300']);
    }

    /** GET /api/tv: what the TV page shows as the owner set it. A TV may keep the answer five minutes. */
    private function tvSettings(): ApiResponse
    {
        return ApiResponse::json(200, ['v' => 1, 'qrStyle' => $this->tv->qrStyle()], ['Cache-Control' => 'public, max-age=300']);
    }

    private function notAllowed(string $allow): ApiResponse
    {
        return ApiResponse::json(405, ['error' => 'method_not_allowed'], self::NO_STORE + ['Allow' => $allow]);
    }

    /** Adds the CORS headers when the request's Origin is allowed (a forbidden one never gets this far). */
    private function withCors(Request $request, ApiResponse $response): ApiResponse
    {
        if ($request->origin === null) {
            return $response;
        }

        // A route may already vary on something else (the streams list varies on Accept-Encoding): keep that, add Origin.
        $vary = $response->headers['Vary'] ?? null;
        if ($vary === null) {
            $vary = 'Origin';
        } elseif (!in_array('origin', array_map(static fn (string $v): string => strtolower(trim($v)), explode(',', $vary)), true)) {
            $vary .= ', Origin';
        }

        return $response->withHeaders(['Access-Control-Allow-Origin' => $request->origin, 'Vary' => $vary]);
    }
}
