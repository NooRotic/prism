<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Api\Router;
use Prism\History\Container;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\Tests\Support\World;

final class RouterTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';

    private World $world;
    private FakeSleeper $sleeper;
    private Router $router;
    private string $logPath;

    /** @var list<ApiResponse> */
    private array $seen = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->sleeper = new FakeSleeper($this->clock);
        $this->logPath = sys_get_temp_dir() . '/prism-router-' . bin2hex(random_bytes(3)) . '.log';
        $this->router = $this->routerWith([]);
    }

    protected function tearDown(): void
    {
        if (is_file($this->logPath)) {
            unlink($this->logPath);
        }
    }

    /** @param array<string,mixed> $override */
    private function routerWith(array $override): Router
    {
        $config = World::config(array_replace_recursive(['log_path' => $this->logPath], $override));

        return Container::router($config, $this->pdo, $this->world->http, $this->clock, $this->sleeper);
    }

    /** @param array<string,string> $query */
    private function call(string $method, string $path, array $query = [], ?string $origin = self::ORIGIN, string $body = ''): ApiResponse
    {
        $response = $this->router->handle(new Request($method, $path, $query, $origin, $body));
        $this->seen[] = $response;

        return $response;
    }

    /** @return array<string,mixed> */
    private function json(ApiResponse $response): array
    {
        return json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
    }

    private function visitBody(string $login): string
    {
        return json_encode(['login' => $login], JSON_THROW_ON_ERROR);
    }

    public function testOptionsAnswers204WithCorsForAnAllowedOrigin(): void
    {
        $response = $this->call('OPTIONS', '/api/visit');

        $this->assertSame(204, $response->status);
        $this->assertSame('', $response->body);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
        $this->assertSame('Origin', $response->headers['Vary']);
        $this->assertStringContainsString('POST', $response->headers['Access-Control-Allow-Methods']);
        $this->assertStringContainsString('Content-Type', $response->headers['Access-Control-Allow-Headers']);
    }

    public function testAdminPreflightAllowsAuthorizationButPublicPathsDoNot(): void
    {
        $admin = $this->call('OPTIONS', '/api/admin/session');
        $public = $this->call('OPTIONS', '/api/visit');

        $this->assertSame(204, $admin->status);
        $this->assertStringContainsString('Authorization', $admin->headers['Access-Control-Allow-Headers']);
        $this->assertStringContainsString('Content-Type', $admin->headers['Access-Control-Allow-Headers']);
        $this->assertSame('Content-Type', $public->headers['Access-Control-Allow-Headers']);
    }

    public function testADisallowedOriginIs403AndGetsNoCorsHeaders(): void
    {
        foreach ([['OPTIONS', '/api/visit'], ['GET', '/api/channel'], ['POST', '/api/visit']] as [$method, $path]) {
            $response = $this->call($method, $path, ['login' => 'alice'], 'https://evil.example', $this->visitBody('alice'));

            $this->assertSame(403, $response->status, "{$method} {$path}");
            $this->assertArrayNotHasKey('Access-Control-Allow-Origin', $response->headers);
        }
        $this->assertSame([], $this->world->http->requests);
    }

    public function testARequestWithNoOriginIsProcessed(): void
    {
        $response = $this->call('GET', '/api/channel', ['login' => 'nobody'], null);

        $this->assertSame(404, $response->status);
        $this->assertSame(['tracked' => false], $this->json($response));
        $this->assertArrayNotHasKey('Access-Control-Allow-Origin', $response->headers);
    }

    public function testVisitWithATextPlainBodyReturnsThePayload(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());

        $response = $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('alice'));

        $this->assertSame(200, $response->status);
        $payload = $this->json($response);
        $this->assertTrue($payload['tracked']);
        $this->assertSame('alice', $payload['login']);
        $this->assertSame('ok', $payload['tt_status']);
        $this->assertSame('no-store', $response->headers['Cache-Control']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
        $this->assertStringContainsString('application/json', $response->headers['Content-Type']);
    }

    public function testVisitBadJsonIs400(): void
    {
        foreach (['not json', '{"login":5}', '{}', '[]', ''] as $body) {
            $response = $this->call('POST', '/api/visit', [], self::ORIGIN, $body);

            $this->assertSame(400, $response->status, "body: {$body}");
            $this->assertSame(['error' => 'bad_request'], $this->json($response));
        }
    }

    public function testAnInvalidLoginIs400BadLogin(): void
    {
        $response = $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('a b'));

        $this->assertSame(400, $response->status);
        $this->assertSame(['error' => 'bad_login'], $this->json($response));
    }

    public function testAVisitBodyOver1KbIs413(): void
    {
        $response = $this->call('POST', '/api/visit', [], self::ORIGIN, str_repeat('x', 1025));

        $this->assertSame(413, $response->status);
        $this->assertSame([], $this->world->http->requests);
    }

    public function testEachVisitOutcomeHasItsStatus(): void
    {
        $this->world->addUser('1', 'alice');

        $notFound = $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('ghost'));
        $this->assertSame(404, $notFound->status);
        $this->assertSame(['tracked' => false], $this->json($notFound));

        (new ChannelStore($this->pdo, $this->clock))->block('9', 'banned');
        $blocked = $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('banned'));
        $this->assertSame(404, $blocked->status);

        $capped = $this->routerWith(['flags' => ['new_channels_enabled' => false]]);
        $cap = $capped->handle(new Request('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('alice')));
        $this->assertSame(404, $cap->status);

        $disabled = $this->routerWith(['flags' => ['visits_enabled' => false]]);
        $off = $disabled->handle(new Request('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('alice')));
        $this->assertSame(503, $off->status);
        $this->assertSame(['error' => 'disabled'], $this->json($off));

        $this->world->usersStatus = 503;
        $down = $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('someone'));
        $this->assertSame(503, $down->status);
        $this->assertSame(['error' => 'unavailable'], $this->json($down));
    }

    public function testGetUnknownChannelIs404TrackedFalse(): void
    {
        $response = $this->call('GET', '/api/channel', ['login' => 'nobody']);

        $this->assertSame(404, $response->status);
        $this->assertSame(['tracked' => false], $this->json($response));
        $this->assertSame('no-store', $response->headers['Cache-Control']);
    }

    public function testGetKnownChannelIs200WithCacheControl300(): void
    {
        (new ChannelStore($this->pdo, $this->clock))->insertTracked(Fixtures::user('1', 'alice'), null);

        $response = $this->call('GET', '/api/channel', ['login' => 'Alice']);

        $this->assertSame(200, $response->status);
        $this->assertSame('public, max-age=300', $response->headers['Cache-Control']);
        $this->assertSame('alice', $this->json($response)['login']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
    }

    public function testGetDaysParameterAllNumbersAndInvalid(): void
    {
        $channels = new ChannelStore($this->pdo, $this->clock);
        $snapshots = new SnapshotStore($this->pdo, $this->clock);
        $channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $snapshots->upsert('1', '2026-08-01', ['rank' => 9], 'ok');
        $snapshots->upsert('1', '2026-11-12', ['rank' => 8], 'ok');

        $dates = fn (array $query): array => array_column($this->json($this->call('GET', '/api/channel', $query + ['login' => 'alice']))['history'], 'date');

        $this->assertSame(['2026-11-12'], $dates([]));
        $this->assertSame(['2026-08-01', '2026-11-12'], $dates(['days' => 'all']));
        $this->assertSame(['2026-11-12'], $dates(['days' => '7']));
        foreach (['0', 'abc', '3651', '-5', '1.5', ''] as $bad) {
            $response = $this->call('GET', '/api/channel', ['login' => 'alice', 'days' => $bad]);
            $this->assertSame(400, $response->status, "days={$bad}");
            $this->assertSame(['error' => 'bad_days'], $this->json($response));
        }
    }

    /**
     * The page shows 7, 30 and 90 day growth from the default answer, and growth over 90 days needs the row dated
     * 90 days before the newest one. The default window must therefore reach that far back, and no further.
     */
    public function testDefaultWindowIncludesTheRowNinetyDaysBack(): void
    {
        $channels = new ChannelStore($this->pdo, $this->clock);
        $snapshots = new SnapshotStore($this->pdo, $this->clock);
        $channels->insertTracked(Fixtures::user('1', 'alice'), null);
        foreach (['2026-08-13', '2026-08-14', '2026-11-12'] as $date) {
            $snapshots->upsert('1', $date, ['rank' => 8], 'ok');
        }

        $dates = array_column($this->json($this->call('GET', '/api/channel', ['login' => 'alice']))['history'], 'date');

        $this->assertSame(['2026-08-14', '2026-11-12'], $dates);
    }

    public function testGetWithABadOrMissingLoginIs400(): void
    {
        foreach ([[], ['login' => 'a b'], ['login' => ''], ['login' => str_repeat('a', 26)]] as $query) {
            $response = $this->call('GET', '/api/channel', $query);

            $this->assertSame(400, $response->status);
            $this->assertSame(['error' => 'bad_login'], $this->json($response));
        }
    }

    public function testGetForABlockedLoginIs404(): void
    {
        $channels = new ChannelStore($this->pdo, $this->clock);
        $channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $channels->block('1', 'alice');

        $this->assertSame(404, $this->call('GET', '/api/channel', ['login' => 'alice'])->status);
    }

    public function testAWrongMethodIs405WithAnAllowHeader(): void
    {
        $get = $this->call('GET', '/api/visit');
        $post = $this->call('POST', '/api/channel', ['login' => 'alice']);

        $this->assertSame(405, $get->status);
        $this->assertSame('POST, OPTIONS', $get->headers['Allow']);
        $this->assertSame(405, $post->status);
        $this->assertSame('GET, OPTIONS', $post->headers['Allow']);
    }

    public function testAnUnknownPathIs404AndATrailingSlashIsTolerated(): void
    {
        $this->assertSame(404, $this->call('GET', '/nope')->status);
        $this->assertSame(['error' => 'not_found'], $this->json($this->call('GET', '/api/other')));
        $this->assertSame(404, $this->call('GET', '/api/channel/', ['login' => 'nobody'])->status);
        $this->assertSame(['tracked' => false], $this->json($this->call('GET', '/api/channel/', ['login' => 'nobody'])));
    }

    public function testAServerErrorIs500AndTheLogHoldsOnlyTheClassName(): void
    {
        $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $this->pdo->exec('DROP TABLE channels');

        $response = $this->call('GET', '/api/channel', ['login' => 'alice']);

        $this->assertSame(500, $response->status);
        $this->assertSame(['error' => 'server'], $this->json($response));
        $log = (string) file_get_contents($this->logPath);
        $this->assertStringContainsString('error', $log);
        $this->assertStringContainsString('PDOException', $log);
        $this->assertStringNotContainsString('channels', $log);
        $this->assertStringNotContainsString('SQLSTATE', $log);
    }

    public function testEveryAnswerCarriesNosniff(): void
    {
        $this->call('GET', '/api/channel', ['login' => 'nobody']);
        $this->call('POST', '/api/visit', [], self::ORIGIN, 'garbage');
        $this->call('GET', '/api/nope');
        $this->call('GET', '/api/visit');
        $this->call('GET', '/api/channel', ['login' => 'a b']);

        $this->assertCount(5, $this->seen);
        foreach ($this->seen as $response) {
            $this->assertSame('nosniff', $response->headers['X-Content-Type-Options'] ?? null);
        }
    }

    public function testNoResponseEverContainsAConfigSecret(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $this->call('POST', '/api/visit', [], self::ORIGIN, $this->visitBody('alice'));
        $this->call('GET', '/api/channel', ['login' => 'alice']);
        $this->call('GET', '/api/channel', ['login' => 'nobody']);
        $this->call('POST', '/api/visit', [], self::ORIGIN, 'garbage');
        $this->call('GET', '/api/nope');
        $this->call('OPTIONS', '/api/visit');

        foreach ($this->seen as $response) {
            $text = json_encode([$response->headers, $response->body]);
            $this->assertStringNotContainsString(World::SECRET, $text);
            $this->assertStringNotContainsString('dbpass', $text);
            $this->assertStringNotContainsString('dbuser', $text);
        }
        $this->assertGreaterThanOrEqual(6, count($this->seen));
    }
}
