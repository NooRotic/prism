<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Store\StreamStore;

/**
 * Everything under /api/admin/. Each request is authorised first (the owner only), then routed. Answers are never
 * cached and never carry a token, the owner id or a config value beyond the fixed limits in /session.
 */
final class AdminController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    private const MAX_BODY_BYTES = 1024;

    /** The stream forms carry an address of up to 2,000 characters, a name and groups. */
    private const STREAM_BODY_MAX_BYTES = 4096;

    private const PUBLIC_ID = '/^[0-9a-f]{12}$/D';

    public function __construct(
        private AdminGuard $guard,
        private AdminReports $reports,
        private ChannelAdmin $channelAdmin,
        private PlaylistAdmin $playlist,
    ) {
    }

    public function handle(Request $request): ApiResponse
    {
        $decision = $this->guard->authorize($request);
        $early = match ($decision->kind) {
            AdminDecision::NOT_FOUND => $this->error(404, 'not_found'),
            AdminDecision::SIGNED_OUT => $this->error(401, 'signed_out'),
            AdminDecision::REFUSED => ApiResponse::json(403, ['error' => 'forbidden', 'recorded' => $decision->recorded], self::NO_STORE),
            AdminDecision::BUSY => $this->error(429, 'busy', ['Retry-After' => '60']),
            AdminDecision::UNAVAILABLE => $this->error(503, 'unavailable'),
            default => null,
        };
        if ($early !== null) {
            return $early;
        }

        $path = rtrim($request->path, '/');

        return match ($path) {
            '/api/admin/session' => $this->read($request, fn (): array => ['owner' => true, 'limits' => $this->reports->limits()]),
            '/api/admin/overview' => $this->read($request, fn (): array => $this->reports->overview()),
            '/api/admin/usage' => $this->windowed($request, 14, fn (int $days): array => $this->reports->usage($days)),
            '/api/admin/tt' => $this->windowed($request, 30, fn (int $days): array => $this->reports->tt($days)),
            '/api/admin/security' => $this->read($request, fn (): array => $this->reports->security()),
            '/api/admin/channels' => $this->channels($request),
            '/api/admin/channels/remove' => $this->channelAction($request, fn (string $id): bool => $this->channelAdmin->removeAndBlock($id)),
            '/api/admin/channels/unblock' => $this->channelAction($request, fn (string $id): bool => $this->channelAdmin->unblock($id)),
            '/api/admin/streams' => $this->streams($request),
            '/api/admin/streams/add' => $this->streamAction($request, function (array $d): ?array {
                $url = $d['url'] ?? null;
                $name = $d['name'] ?? null;
                $group = $d['group'] ?? null;

                return is_string($url) && strlen($url) <= 2000 && is_string($name) && is_string($group)
                    ? $this->playlist->add($url, $name, $group)
                    : null;
            }),
            '/api/admin/streams/update' => $this->streamAction($request, function (array $d): ?array {
                $id = self::publicId($d);
                $name = $d['name'] ?? null;
                $groups = $d['groups'] ?? null;
                if ($id === null || !is_string($name) || !is_array($groups) || !array_is_list($groups) || count($groups) > 20) {
                    return null;
                }
                foreach ($groups as $group) {
                    if (!is_string($group)) {
                        return null;
                    }
                }

                return $this->playlist->update($id, $name, $groups);
            }),
            '/api/admin/streams/pin' => $this->streamAction($request, function (array $d): ?array {
                $id = self::publicId($d);

                return $id !== null && is_bool($d['pinned'] ?? null) ? $this->playlist->setPinned($id, $d['pinned']) : null;
            }),
            '/api/admin/streams/default' => $this->streamAction($request, function (array $d): ?array {
                $id = self::publicId($d);

                return $id === null ? null : $this->playlist->setDefault($id);
            }),
            '/api/admin/streams/remove' => $this->streamAction($request, function (array $d): ?array {
                $id = self::publicId($d);

                return $id === null ? null : $this->playlist->remove($id);
            }),
            default => $this->error(404, 'not_found'),
        };
    }

    /** GET /api/admin/streams?text=&state=&group=&country=&limit=&offset= : every stream, every state, paged. */
    private function streams(Request $request): ApiResponse
    {
        if ($request->method !== 'GET') {
            return $this->notAllowed('GET, OPTIONS');
        }
        $filters = [];
        foreach (['text' => 100, 'group' => 40] as $key => $max) {
            $value = $request->query[$key] ?? '';
            if (!is_string($value) || mb_strlen($value) > $max || preg_match('/[\x00-\x1f\x7f]/', $value) === 1) {
                return $this->error(400, 'bad_query');
            }
            $filters[$key] = $value;
        }
        $state = $request->query['state'] ?? '';
        $country = $request->query['country'] ?? '';
        if (!is_string($state) || ($state !== '' && !in_array($state, StreamStore::STATES, true))
            || !is_string($country) || preg_match('/^(?:[a-z]{2})?$/D', $country) !== 1) {
            return $this->error(400, 'bad_query');
        }
        $filters += ['state' => $state, 'country' => $country];

        $limit = $request->query['limit'] ?? '50';
        $offset = $request->query['offset'] ?? '0';
        if (!is_string($limit) || preg_match('/^\d{1,3}$/D', $limit) !== 1 || (int) $limit < 1 || (int) $limit > 200
            || !is_string($offset) || preg_match('/^\d{1,7}$/D', $offset) !== 1) {
            return $this->error(400, 'bad_query');
        }

        return ApiResponse::json(200, $this->playlist->list($filters, (int) $limit, (int) $offset), self::NO_STORE);
    }

    /**
     * One POST with a JSON body. `$act` gets the decoded body and answers a PlaylistAdmin result, or null for a body that
     * is not what the action needs (400).
     *
     * @param callable(array<string,mixed>):?array<string,mixed> $act
     */
    private function streamAction(Request $request, callable $act): ApiResponse
    {
        if ($request->method !== 'POST') {
            return $this->notAllowed('POST, OPTIONS');
        }
        if (strlen($request->body) > self::STREAM_BODY_MAX_BYTES) {
            return $this->error(413, 'too_large');
        }
        $data = json_decode($request->body, true);
        $result = is_array($data) && !array_is_list($data) ? $act($data) : null;
        if ($result === null) {
            return $this->error(400, 'bad_request');
        }
        if ($result['ok'] === true) {
            return ApiResponse::json(200, $result, self::NO_STORE);
        }

        return match ($result['error']) {
            'not_found' => $this->error(404, 'not_found'),
            'rejected' => ApiResponse::json(422, ['error' => 'rejected', 'reason' => $result['reason']], self::NO_STORE),
            'already_known' => ApiResponse::json(409, ['error' => 'already_known', 'public_id' => $result['public_id']], self::NO_STORE),
            default => $this->error(409, (string) $result['error']), // not_listed
        };
    }

    /** @param array<string,mixed> $data */
    private static function publicId(array $data): ?string
    {
        $id = $data['public_id'] ?? null;

        return is_string($id) && preg_match(self::PUBLIC_ID, $id) === 1 ? $id : null;
    }

    private function channels(Request $request): ApiResponse
    {
        $query = $request->query['q'] ?? '';
        if (!is_string($query) || preg_match('/^[A-Za-z0-9_]{0,25}$/', $query) !== 1) {
            return $this->method($request, 'GET') ?? $this->error(400, 'bad_query');
        }

        return $this->read($request, fn (): array => $this->reports->channels($query));
    }

    /** @param callable(string):bool $act */
    private function channelAction(Request $request, callable $act): ApiResponse
    {
        if ($request->method !== 'POST') {
            return $this->notAllowed('POST, OPTIONS');
        }
        if (strlen($request->body) > self::MAX_BODY_BYTES) {
            return $this->error(413, 'too_large');
        }
        $data = json_decode($request->body, true);
        $id = is_array($data) ? ($data['twitch_id'] ?? null) : null;
        if (!is_string($id) || preg_match('/^\d{1,20}$/', $id) !== 1) {
            return $this->error(400, 'bad_request');
        }

        return $act($id) ? ApiResponse::json(200, ['ok' => true], self::NO_STORE) : $this->error(404, 'not_found');
    }

    /** A 405 when the request is not the expected method, else null. */
    private function method(Request $request, string $expected): ?ApiResponse
    {
        return $request->method === $expected ? null : $this->notAllowed($expected . ', OPTIONS');
    }

    /** @param callable():array<string,mixed> $body */
    private function read(Request $request, callable $body): ApiResponse
    {
        if ($request->method !== 'GET') {
            return $this->notAllowed('GET, OPTIONS');
        }

        return ApiResponse::json(200, $body(), self::NO_STORE);
    }

    /** @param callable(int):array<string,mixed> $body */
    private function windowed(Request $request, int $default, callable $body): ApiResponse
    {
        if ($request->method !== 'GET') {
            return $this->notAllowed('GET, OPTIONS');
        }
        $param = $request->query['days'] ?? null;
        if ($param === null) {
            $days = $default;
        } elseif (is_string($param) && in_array($param, ['14', '30', '90'], true)) {
            $days = (int) $param;
        } else {
            return $this->error(400, 'bad_days');
        }

        return ApiResponse::json(200, $body($days), self::NO_STORE);
    }

    /** @param array<string,string> $extra */
    private function error(int $status, string $code, array $extra = []): ApiResponse
    {
        return ApiResponse::json($status, ['error' => $code], self::NO_STORE + $extra);
    }

    private function notAllowed(string $allow): ApiResponse
    {
        return $this->error(405, 'method_not_allowed', ['Allow' => $allow]);
    }
}
