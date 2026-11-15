<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

/** The checker's admin routes through the real router: who may call them, with what method, and the shapes they answer. */
final class AdminCheckerApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const STRANGER_TOKEN = 'strangertoken012345678strangerx';
    private const RECENT = '2026-11-12 02:00:00';

    private World $world;
    private StreamStore $store;
    private string $root;
    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'theowner', 'front');
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->root = sys_get_temp_dir() . '/prism-admincheck-' . bin2hex(random_bytes(4));
        $this->logPath = $this->root . '.log';
    }

    protected function tearDown(): void
    {
        foreach (glob($this->root . '/data/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->root . '/data');
        @rmdir($this->root);
        if (is_file($this->logPath)) {
            unlink($this->logPath);
        }
    }

    private function call(string $method, string $path, string $body = '', ?string $token = self::OWNER_TOKEN): ApiResponse
    {
        $config = World::config([
            'log_path' => $this->logPath,
            'admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front'],
            'playlist' => ['data_dir' => $this->root . '/data', 'logo_dir' => $this->root . '/logos'],
        ]);
        $router = Container::router($config, $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));

        return $router->handle(new Request($method, $path, [], self::ORIGIN, $body, $token === null ? null : 'Bearer ' . $token));
    }

    /** @return array<string,mixed> */
    private function json(ApiResponse $response): array
    {
        return json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @param array<string,mixed> $extra */
    private function checked(string $n, string $code, array $extra = []): void
    {
        $url = 'https://host' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        $this->store->insertIfNew(array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'Stream ' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test', 'check_result' => $code, 'last_checked_at' => self::RECENT,
        ], $extra));
    }

    /** @return list<array{0:string,1:string}> */
    private static function routes(): array
    {
        return [['GET', '/api/admin/checker'], ['POST', '/api/admin/checker/apply'], ['POST', '/api/admin/checker/pause'], ['POST', '/api/admin/checker/resume']];
    }

    public function testOnlyTheOwnerMayCallAnyOfThem(): void
    {
        foreach (self::routes() as [$method, $path]) {
            $this->assertSame(401, $this->call($method, $path, $method === 'POST' ? '{}' : '', null)->status, "$method $path signed out");
            $this->assertSame(403, $this->call($method, $path, $method === 'POST' ? '{}' : '', self::STRANGER_TOKEN)->status, "$method $path stranger");
        }
        $this->assertFalse($this->json($this->call('GET', '/api/admin/checker'))['paused'], 'the owner is let in');
    }

    public function testWrongMethodsAre405WithTheAllowHeader(): void
    {
        $this->assertSame('GET, OPTIONS', $this->call('POST', '/api/admin/checker', '{}')->headers['Allow']);
        foreach (['apply', 'pause', 'resume'] as $action) {
            $this->assertSame(405, $this->call('GET', '/api/admin/checker/' . $action)->status, $action);
            $this->assertSame('POST, OPTIONS', $this->call('GET', '/api/admin/checker/' . $action)->headers['Allow'], $action);
        }
    }

    public function testStatusHasExactlyTheDocumentedShape(): void
    {
        $this->checked('1', 'pass');

        $response = $this->call('GET', '/api/admin/checker');
        $s = $this->json($response);

        $this->assertSame(200, $response->status);
        $this->assertSame('no-store', $response->headers['Cache-Control']);
        $this->assertSame(
            ['mode', 'applied_at', 'paused', 'progress', 'outcome', 'would_hide', 'counts', 'clusters', 'guarded_hosts', 'flagged', 'budget', 'last_stop'],
            array_keys($s),
        );
        $this->assertSame('shadow', $s['mode']);
        $this->assertSame(['eligible' => 1, 'checked' => 1, 'oldest_result_at' => self::RECENT], $s['progress']);
        $this->assertSame(['bytes_today', 'daily_cap', 'first_pass_bytes', 'first_pass_cap'], array_keys($s['budget']));
    }

    public function testApplyAcceptsAnEmptyBodyOrAnEmptyObjectAndAppliesOnce(): void
    {
        $this->checked('1', 'pass');
        $this->checked('2', 'pass');
        $this->checked('3', 'unreachable');
        $this->checked('4', 'pass');

        $first = $this->call('POST', '/api/admin/checker/apply', '{}');
        $second = $this->call('POST', '/api/admin/checker/apply', '');

        $this->assertSame(200, $first->status);
        $this->assertSame(['ok' => true, 'hidden' => 1, 'listed' => 3, 'snapshot' => true], $this->json($first));
        $this->assertSame(200, $second->status);
        $this->assertTrue($this->json($second)['already']);
        $this->assertSame('live', $this->json($this->call('GET', '/api/admin/checker'))['mode']);
    }

    public function testARefusedApplyIs409WithTheReason(): void
    {
        $this->checked('1', 'pass');
        $this->store->insertIfNew([
            'id' => StreamUrl::id('https://unchecked.test/x'), 'public_id' => StreamUrl::publicId(StreamUrl::id('https://unchecked.test/x')),
            'url' => 'https://unchecked.test/x', 'name' => 'Unchecked', 'groups_json' => '["News"]', 'kind' => 'hls', 'state' => 'new', 'source' => 'test',
        ]);

        $response = $this->call('POST', '/api/admin/checker/apply', '{}');

        $this->assertSame(409, $response->status);
        $this->assertSame(['error' => 'refused', 'reason' => 'incomplete'], $this->json($response));
    }

    public function testPauseAndResumeFlipTheSwitch(): void
    {
        $this->assertSame(['ok' => true, 'paused' => true], $this->json($this->call('POST', '/api/admin/checker/pause', '{}')));
        $this->assertTrue($this->json($this->call('GET', '/api/admin/checker'))['paused']);
        $this->assertSame(['ok' => true, 'paused' => false], $this->json($this->call('POST', '/api/admin/checker/resume')));
        $this->assertFalse($this->json($this->call('GET', '/api/admin/checker'))['paused']);
    }

    public function testABodyThatIsNotAnObjectOrIsTooBigIsRefused(): void
    {
        $this->assertSame(400, $this->call('POST', '/api/admin/checker/pause', '[1,2]')->status);
        $this->assertSame(400, $this->call('POST', '/api/admin/checker/pause', 'not json')->status);
        $this->assertSame(413, $this->call('POST', '/api/admin/checker/pause', '{"x":"' . str_repeat('a', 2000) . '"}')->status);
        $this->assertFalse($this->json($this->call('GET', '/api/admin/checker'))['paused']);
    }
}
