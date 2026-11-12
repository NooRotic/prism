<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use LogicException;
use Prism\History\Http\HttpClient;
use Prism\History\Http\HttpResponse;

/**
 * A transport that never touches the network. Routes are keyed "METHOD url-prefix" and matched in the order
 * they were added. A route's answer is an HttpResponse, a list of them (handed out in order; the last one
 * repeats) or a callable that gets the request array and returns one. Every request is recorded.
 */
final class FakeHttp implements HttpClient
{
    /** @var list<array{method:string,url:string,headers:array<string,string>,body:?string}> */
    public array $requests = [];

    /** @param array<string,HttpResponse|list<HttpResponse>|callable> $routes */
    public function __construct(private array $routes = [])
    {
    }

    /** @param HttpResponse|list<HttpResponse>|callable $answer */
    public function route(string $key, HttpResponse|array|callable $answer): void
    {
        $this->routes[$key] = $answer;
    }

    /**
     * @param array<string,mixed>|string $data
     * @param array<string,string> $headers
     */
    public static function json(array|string $data, int $status = 200, array $headers = []): HttpResponse
    {
        return new HttpResponse($status, is_string($data) ? $data : json_encode($data, JSON_THROW_ON_ERROR), $headers);
    }

    public function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutSec = 10): HttpResponse
    {
        $request = ['method' => $method, 'url' => $url, 'headers' => $headers, 'body' => $body];
        $this->requests[] = $request;

        foreach ($this->routes as $key => $answer) {
            [$routeMethod, $prefix] = explode(' ', $key, 2);
            if ($routeMethod !== $method || !str_starts_with($url, $prefix)) {
                continue;
            }
            if (is_callable($answer)) {
                return $answer($request);
            }
            if (is_array($answer)) {
                $next = count($answer) > 1 ? array_shift($answer) : $answer[0];
                $this->routes[$key] = $answer;

                return $next;
            }

            return $answer;
        }

        throw new LogicException("FakeHttp has no route for {$method} {$url}");
    }
}
