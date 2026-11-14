<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Store\UsageCounters;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

final class HitApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';

    private World $world;
    private \Prism\History\Api\Router $router;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->router = Container::router(World::config(), $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));
    }

    private function hit(string $body, string $method = 'POST', ?string $origin = self::ORIGIN): ApiResponse
    {
        return $this->router->handle(new Request($method, '/api/hit', [], $origin, $body));
    }

    private function total(): int
    {
        return (int) $this->pdo->query('SELECT COALESCE(SUM(n), 0) FROM usage_counters')->fetchColumn();
    }

    public function testAValidSectionAnswers204AndCountsOne(): void
    {
        $response = $this->hit('{"section":"twitch"}');

        $this->assertSame(204, $response->status);
        $this->assertSame('no-store', $response->headers['Cache-Control']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
        $this->assertSame(1, (new UsageCounters($this->pdo, $this->clock))->valueOn('2026-11-12', 'hit:twitch'));
    }

    public function testEverySectionInTheListIsAccepted(): void
    {
        foreach (['home', 'twitch', 'youtube', 'hls-dash', 'chat-popout', 'other'] as $section) {
            $this->assertSame(204, $this->hit(json_encode(['section' => $section]))->status, $section);
        }
        $this->assertSame(6, $this->total());
    }

    public function testEveryUnknownSectionIs400AndCountsNothing(): void
    {
        $bodies = [
            '{"section":""}', '{"section":"Home"}', '{"section":"__proto__"}', '{"section":"twitch "}',
            '{"section":5}', '{"section":["home"]}', '{"section":null}', '{}', '[]', '"home"',
        ];
        foreach ($bodies as $body) {
            $response = $this->hit($body);

            $this->assertSame(400, $response->status, $body);
        }
        $this->assertSame(0, $this->total());
    }

    public function testNonJsonAndOversizeBodies(): void
    {
        $this->assertSame(400, $this->hit('not json')->status);
        $this->assertSame(400, $this->hit('')->status);
        $this->assertSame(413, $this->hit(str_repeat('x', 1025))->status);
        $this->assertSame(0, $this->total());
    }

    public function testTheCapAnswers429AfterTheLimit(): void
    {
        for ($i = 0; $i < 600; $i++) {
            $this->assertSame(204, $this->hit('{"section":"home"}')->status, "hit {$i}");
        }

        $capped = $this->hit('{"section":"home"}');

        $this->assertSame(429, $capped->status);
        $this->assertSame('60', $capped->headers['Retry-After']);
        $this->assertSame(600, $this->total());

        $this->clock->advanceMs(60_000);
        $this->assertSame(204, $this->hit('{"section":"home"}')->status, 'the next minute starts again');
    }

    public function testWrongMethodIs405(): void
    {
        $response = $this->hit('', 'GET');

        $this->assertSame(405, $response->status);
        $this->assertSame('POST, OPTIONS', $response->headers['Allow']);
    }

    public function testADisallowedOriginIs403AndCountsNothing(): void
    {
        $response = $this->hit('{"section":"home"}', 'POST', 'https://evil.example');

        $this->assertSame(403, $response->status);
        $this->assertSame(0, $this->total());
    }

    public function testTheHitPreflightAllowsTheCrossOriginPost(): void
    {
        $response = $this->router->handle(new Request('OPTIONS', '/api/hit', [], self::ORIGIN, ''));

        $this->assertSame(204, $response->status);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
    }
}
