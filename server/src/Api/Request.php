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
        );
    }
}
