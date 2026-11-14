<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;

/**
 * Everything under /api/admin/. Each request is authorised first (the owner only), then routed. Answers are never
 * cached and never carry a token, the owner id or a config value beyond the fixed limits in /session.
 */
final class AdminController
{
    private const NO_STORE = ['Cache-Control' => 'no-store'];

    public function __construct(private AdminGuard $guard, private AdminReports $reports)
    {
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
            default => $this->error(404, 'not_found'),
        };
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
