<?php

declare(strict_types=1);

namespace Prism\History\Api;

/** The parts of an HTTP request the API looks at. Nothing about the client (address, agent) is carried. */
final class Request
{
    /** @param array<string,mixed> $query */
    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public ?string $origin,
        public string $body,
        public ?string $authorization = null,
    ) {
    }

    /** Builds a request from PHP's globals. The body is read only up to one byte past the limit the router allows. */
    public static function fromGlobals(): self
    {
        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/'),
            $_GET,
            isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : null,
            (string) file_get_contents('php://input', false, null, 0, 1025),
            self::authorizationFromGlobals(),
        );
    }

    /**
     * The token after `Bearer `, or null. Null too for another scheme, an empty or whitespace-carrying token, and
     * anything over 200 characters (a real Twitch token is 30), so a hostile header never reaches Twitch.
     */
    public function bearerToken(): ?string
    {
        if ($this->authorization === null || preg_match('/^Bearer ([^\s]{1,200})$/i', $this->authorization, $m) !== 1) {
            return null;
        }

        return $m[1];
    }

    /**
     * The Authorization header as the host hands it over. The IONOS PHP is a CGI build, where Apache may pass it
     * as HTTP_AUTHORIZATION, as REDIRECT_HTTP_AUTHORIZATION (after the rewrite to the front controller) or, when
     * nothing else gets through, as the custom X-Prism-Authorization header.
     */
    private static function authorizationFromGlobals(): ?string
    {
        foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'HTTP_X_PRISM_AUTHORIZATION'] as $key) {
            if (isset($_SERVER[$key]) && is_string($_SERVER[$key])) {
                return $_SERVER[$key];
            }
        }

        return null;
    }
}
