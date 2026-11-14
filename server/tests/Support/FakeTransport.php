<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Net\PinnedResponse;
use Prism\History\Net\PinnedTransport;
use RuntimeException;
use Throwable;

/** Plays back queued responses (or exceptions) in order and remembers every request it was given. */
final class FakeTransport implements PinnedTransport
{
    /** @var list<array{url:string,ip:string,port:int,maxBytes:int,timeoutSec:int,userAgent:string}> */
    public array $calls = [];

    /** @var list<PinnedResponse|Throwable> */
    private array $queue = [];

    public function push(PinnedResponse|Throwable ...$responses): self
    {
        foreach ($responses as $response) {
            $this->queue[] = $response;
        }

        return $this;
    }

    public static function ok(string $body = 'ok', array $headers = []): PinnedResponse
    {
        return new PinnedResponse(200, $headers, $body, false);
    }

    public static function redirect(string $location, int $status = 302, string $body = ''): PinnedResponse
    {
        return new PinnedResponse($status, ['location' => $location], $body, false);
    }

    public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = ''): PinnedResponse
    {
        $this->calls[] = compact('url', 'ip', 'port', 'maxBytes', 'timeoutSec', 'userAgent');
        $next = array_shift($this->queue);
        if ($next === null) {
            throw new RuntimeException('FakeTransport: a request was made that the test did not expect: ' . $url);
        }
        if ($next instanceof Throwable) {
            throw $next;
        }

        return $next;
    }
}
