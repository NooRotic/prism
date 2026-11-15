<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Net\PinnedResponse;
use Prism\History\Net\PinnedTransport;
use Throwable;

/**
 * A transport that answers by rule instead of from a queue, for tests that check many streams in an order the test does not
 * control. The rule gets the address, how many times that exact address has been asked for (1 the first time) and the host,
 * and answers a response or an exception. Every request is remembered with the fake clock's time.
 */
final class RoutedTransport implements PinnedTransport
{
    /** @var list<array{url:string,host:string,headers:array<string,string>,probe:bool,at:int}> */
    public array $calls = [];

    /** @var (callable(string):void)|null runs when a request arrives, to stand in for something that happens meanwhile */
    public $onCall = null;

    /** @var array<string,int> */
    private array $attempts = [];

    /** @param callable(string,int,string):(PinnedResponse|Throwable) $route */
    public function __construct(private $route, private FakeClock $clock)
    {
    }

    public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = '', array $requestHeaders = [], bool $probe = false): PinnedResponse
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $this->attempts[$url] = ($this->attempts[$url] ?? 0) + 1;
        $this->calls[] = ['url' => $url, 'host' => $host, 'headers' => $requestHeaders, 'probe' => $probe, 'at' => $this->clock->nowMs()];
        if ($this->onCall !== null) {
            ($this->onCall)($url);
        }
        $answer = ($this->route)($url, $this->attempts[$url], $host);
        if ($answer instanceof Throwable) {
            throw $answer;
        }

        return $answer;
    }

    /** A playable stream's playlist: one segment, on demand, CORS open. */
    public static function playlist(): PinnedResponse
    {
        return FakeTransport::ok("#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n", ['access-control-allow-origin' => '*']);
    }

    /** The first kilobyte of a segment, CORS open. */
    public static function segment(): PinnedResponse
    {
        return new PinnedResponse(200, ['access-control-allow-origin' => '*'], str_repeat('B', 1000), false);
    }

    public static function dead(): PinnedResponse
    {
        return new PinnedResponse(500, [], '', false);
    }
}
