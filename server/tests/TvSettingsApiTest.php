<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

/** The TV's QR style through the real router: read by the TV (GET /api/tv), set by the owner (POST /api/admin/tv). */
final class TvSettingsApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const STRANGER_TOKEN = 'strangertoken012345678strangerx';

    private World $world;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'theowner', 'front');
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
    }

    private function call(string $method, string $path, string $body = '', ?string $token = null): ApiResponse
    {
        $config = World::config(['admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front']]);
        $router = Container::router($config, $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));

        return $router->handle(new Request($method, $path, [], self::ORIGIN, $body, $token === null ? null : 'Bearer ' . $token));
    }

    private function tvStyle(): string
    {
        $response = $this->call('GET', '/api/tv');
        $this->assertSame(200, $response->status);
        $body = json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(['v', 'qrStyle'], array_keys($body));
        $this->assertSame(1, $body['v']);

        return $body['qrStyle'];
    }

    private function set(string $body, ?string $token = self::OWNER_TOKEN): ApiResponse
    {
        return $this->call('POST', '/api/admin/tv', $body, $token);
    }

    public function testTheTvGetsBByDefault(): void
    {
        $this->assertSame('b', $this->tvStyle());
    }

    public function testTheOwnerChangesItAndTheTvSeesIt(): void
    {
        $response = $this->set('{"qrStyle":"c"}');
        $this->assertSame(200, $response->status);
        $this->assertSame(['ok' => true, 'qrStyle' => 'c'], json_decode($response->body, true, 512, JSON_THROW_ON_ERROR));
        $this->assertSame('c', $this->tvStyle());

        $audit = $this->pdo->query("SELECT action, target, detail FROM admin_audit WHERE action = 'tv_qr_style'")->fetchAll(\PDO::FETCH_ASSOC);
        $this->assertSame([['action' => 'tv_qr_style', 'target' => '', 'detail' => 'b -> c']], $audit);
    }

    public function testOnlyTheOwnerMayChangeIt(): void
    {
        $this->assertSame(401, $this->set('{"qrStyle":"a"}', null)->status);
        $this->assertSame(403, $this->set('{"qrStyle":"a"}', self::STRANGER_TOKEN)->status);
        $this->assertSame('b', $this->tvStyle());
    }

    public function testNonsenseIsRefused(): void
    {
        foreach (['{"qrStyle":"d"}', '{}', '[]', '"c"', '{"qrStyle":"a","more":1}', 'not json', ''] as $body) {
            $response = $this->set($body);
            $this->assertSame(400, $response->status, $body);
            $this->assertSame('bad_request', json_decode($response->body, true, 512, JSON_THROW_ON_ERROR)['error'], $body);
        }
        $this->assertSame(413, $this->set(str_repeat(' ', 5000) . '{"qrStyle":"a"}')->status);
        $this->assertSame('b', $this->tvStyle());
    }

    public function testTheAnswerMayBeCachedFiveMinutes(): void
    {
        $response = $this->call('GET', '/api/tv');
        $this->assertSame('public, max-age=300', $response->headers['Cache-Control']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin'] ?? null);
    }

    public function testWrongMethods(): void
    {
        $post = $this->call('POST', '/api/tv', '{"qrStyle":"a"}');
        $this->assertSame(405, $post->status);
        $this->assertSame('GET, OPTIONS', $post->headers['Allow']);
        $get = $this->call('GET', '/api/admin/tv', '', self::OWNER_TOKEN);
        $this->assertSame(405, $get->status);
        $this->assertSame('POST, OPTIONS', $get->headers['Allow']);
        $this->assertSame('b', $this->tvStyle());
    }
}
