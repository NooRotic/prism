<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

final class StreamsApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/prism-streams-api-' . bin2hex(random_bytes(6));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/{,.}*', GLOB_BRACE) ?: [] as $entry) {
            if (is_file($entry)) {
                unlink($entry);
            } elseif (is_dir($entry) && !in_array(basename($entry), ['.', '..'], true)) {
                rmdir($entry);
            }
        }
        if (is_dir($this->dir)) {
            rmdir($this->dir);
        }
    }

    private function writeSnapshot(): void
    {
        $store = new StreamStore($this->pdo, $this->clock);
        $url = 'https://host.test/live.m3u8';
        $id = StreamUrl::id($url);
        $store->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'Alpha', 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'working', 'source' => 'test',
        ]);
        (new SnapshotWriter($store, $this->clock, $this->dir))->write();
    }

    /** @param array<string,mixed> $override */
    private function call(string $method = 'GET', ?string $origin = self::ORIGIN, ?string $ifNoneMatch = null, ?string $acceptEncoding = null, array $override = []): ApiResponse
    {
        $router = Container::router(
            World::config(['playlist' => ['data_dir' => $this->dir]] + $override),
            $this->pdo,
            (new World())->http,
            $this->clock,
            new FakeSleeper($this->clock),
        );

        return $router->handle(new Request($method, '/api/streams', [], $origin, '', null, $ifNoneMatch, $acceptEncoding));
    }

    public function testServesTheSnapshotWithEtagAndCache(): void
    {
        $this->writeSnapshot();

        $r = $this->call();

        $this->assertSame(200, $r->status);
        $this->assertSame((string) file_get_contents($this->dir . '/streams.json'), $r->body);
        $this->assertSame('application/json; charset=utf-8', $r->headers['Content-Type']);
        $this->assertSame('nosniff', $r->headers['X-Content-Type-Options']);
        $this->assertSame('public, max-age=300', $r->headers['Cache-Control']);
        $this->assertMatchesRegularExpression('/^"[0-9a-f]{16,64}"$/', $r->headers['ETag']);
        $this->assertArrayNotHasKey('Content-Encoding', $r->headers);
        $this->assertSame(self::ORIGIN, $r->headers['Access-Control-Allow-Origin']);
        $vary = array_map('trim', explode(',', $r->headers['Vary']));
        $this->assertContains('Origin', $vary);
        $this->assertContains('Accept-Encoding', $vary);
        $this->assertSame(1, json_decode($r->body, true)['v']);
    }

    public function testTheEtagIsTheSameWhileTheFileIsAndChangesWithIt(): void
    {
        $this->writeSnapshot();
        $first = $this->call()->headers['ETag'];
        $this->assertSame($first, $this->call()->headers['ETag']);

        $this->clock->advanceMs(60_000);
        $this->writeSnapshot(); // same streams, new "generated" time: a different file
        $this->assertNotSame($first, $this->call()->headers['ETag']);
    }

    public function testAMatchingIfNoneMatchIs304WithNoBody(): void
    {
        $this->writeSnapshot();
        $etag = $this->call()->headers['ETag'];

        foreach ([$etag, 'W/' . $etag, '"other", ' . $etag, '*'] as $header) {
            $r = $this->call('GET', self::ORIGIN, $header);

            $this->assertSame(304, $r->status, $header);
            $this->assertSame('', $r->body, $header);
            $this->assertSame($etag, $r->headers['ETag']);
            $this->assertSame('public, max-age=300', $r->headers['Cache-Control']);
            $this->assertSame(self::ORIGIN, $r->headers['Access-Control-Allow-Origin']);
        }
        foreach (['"nope"', '', 'garbage'] as $header) {
            $this->assertSame(200, $this->call('GET', self::ORIGIN, $header)->status, $header);
        }
    }

    public function testGzipWhenAcceptedAndPlainWhenNot(): void
    {
        $this->writeSnapshot();
        $plain = (string) file_get_contents($this->dir . '/streams.json');

        $gz = $this->call('GET', self::ORIGIN, null, 'gzip, deflate, br');
        $this->assertSame(200, $gz->status);
        $this->assertSame('gzip', $gz->headers['Content-Encoding']);
        $this->assertSame($plain, gzdecode($gz->body));
        $this->assertSame('application/json; charset=utf-8', $gz->headers['Content-Type']);

        foreach ([null, '', 'identity', 'br', 'gzip;q=0', 'GZIP;Q=0.0'] as $accept) {
            $r = $this->call('GET', self::ORIGIN, null, $accept);
            $this->assertSame($plain, $r->body, json_encode($accept));
            $this->assertArrayNotHasKey('Content-Encoding', $r->headers);
        }
        foreach (['gzip', 'GZip', 'deflate, gzip;q=0.5', ' gzip '] as $accept) {
            $this->assertSame('gzip', $this->call('GET', self::ORIGIN, null, $accept)->headers['Content-Encoding'] ?? null, $accept);
        }
    }

    public function testEachEncodingHasItsOwnEtagAndRevalidatesWithIt(): void
    {
        $this->writeSnapshot();
        $plain = $this->call()->headers['ETag'];
        $gz = $this->call('GET', self::ORIGIN, null, 'gzip')->headers['ETag'];

        $this->assertNotSame($plain, $gz);
        $this->assertSame(304, $this->call('GET', self::ORIGIN, $gz, 'gzip')->status);
        $this->assertSame(200, $this->call('GET', self::ORIGIN, $gz, null)->status, 'a tag for the compressed copy does not match the plain one');
    }

    public function testAMissingGzipFileFallsBackToThePlainOne(): void
    {
        $this->writeSnapshot();
        unlink($this->dir . '/streams.json.gz');

        $r = $this->call('GET', self::ORIGIN, null, 'gzip');

        $this->assertSame(200, $r->status);
        $this->assertArrayNotHasKey('Content-Encoding', $r->headers);
        $this->assertSame(1, json_decode($r->body, true)['v']);
    }

    public function testBeforeTheFirstImportIs503NotReady(): void
    {
        $r = $this->call();

        $this->assertSame(503, $r->status);
        $this->assertSame(['error' => 'not_ready'], json_decode($r->body, true));
        $this->assertSame('no-store', $r->headers['Cache-Control']);
    }

    public function testAnUnreadableOrEmptyFileIs503(): void
    {
        mkdir($this->dir);
        mkdir($this->dir . '/streams.json'); // a folder where the file should be
        $this->assertSame(503, $this->call()->status);
        rmdir($this->dir . '/streams.json');

        file_put_contents($this->dir . '/streams.json', '');
        $this->assertSame(503, $this->call()->status);
        $this->assertSame(503, $this->call('GET', self::ORIGIN, null, 'gzip')->status);
    }

    public function testWrongMethodIs405(): void
    {
        $this->writeSnapshot();

        foreach (['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'] as $method) {
            $r = $this->call($method);

            $this->assertSame(405, $r->status, $method);
            $this->assertSame('GET, OPTIONS', $r->headers['Allow'], $method);
        }
    }

    public function testADisallowedOriginIs403(): void
    {
        $this->writeSnapshot();

        $r = $this->call('GET', 'https://evil.example');

        $this->assertSame(403, $r->status);
        $this->assertArrayNotHasKey('Access-Control-Allow-Origin', $r->headers);
        $this->assertStringNotContainsString('Alpha', $r->body);
    }

    public function testCorsHeadersForAnAllowedOriginAndNoneWithoutOne(): void
    {
        $this->writeSnapshot();

        $with = $this->call('GET', 'http://localhost:5000');
        $this->assertSame('http://localhost:5000', $with->headers['Access-Control-Allow-Origin']);

        $without = $this->call('GET', null);
        $this->assertSame(200, $without->status);
        $this->assertArrayNotHasKey('Access-Control-Allow-Origin', $without->headers);
        $this->assertStringContainsString('Origin', $without->headers['Vary'], 'a cache must still keep answers for different origins apart');
    }

    public function testThePreflightIsAnswered(): void
    {
        $r = $this->call('OPTIONS');

        $this->assertSame(204, $r->status);
        $this->assertStringContainsString('GET', $r->headers['Access-Control-Allow-Methods']);
        $this->assertSame(self::ORIGIN, $r->headers['Access-Control-Allow-Origin']);
    }
}
