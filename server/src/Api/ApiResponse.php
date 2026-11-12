<?php

declare(strict_types=1);

namespace Prism\History\Api;

final class ApiResponse
{
    /** @param array<string,string> $headers */
    public function __construct(
        public int $status,
        public array $headers,
        public string $body,
    ) {
    }

    /**
     * @param array<string,mixed> $data
     * @param array<string,string> $headers
     */
    public static function json(int $status, array $data, array $headers = []): self
    {
        return new self(
            $status,
            ['Content-Type' => 'application/json; charset=utf-8'] + $headers,
            json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        );
    }

    public function withHeaders(array $headers): self
    {
        return new self($this->status, $headers + $this->headers, $this->body);
    }

    public function emit(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        if ($this->status !== 204) {
            echo $this->body;
        }
    }
}
