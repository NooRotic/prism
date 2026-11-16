<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\FavoriteStore;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

final class FavoritesApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';

    private \Prism\History\Api\Router $router;

    protected function setUp(): void
    {
        parent::setUp();
        $this->router = Container::router(World::config(), $this->pdo, (new World())->http, $this->clock, new FakeSleeper($this->clock));
    }

    /** Adds a stream in the given state and returns its short public id. */
    private function stream(string $name, string $state = 'working'): string
    {
        $url = 'https://host.test/' . $name . '.m3u8';
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => $name, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => $state, 'source' => 'test',
        ]);

        return StreamUrl::publicId($id);
    }

    private function star(string $body, string $method = 'POST', ?string $origin = self::ORIGIN): ApiResponse
    {
        return $this->router->handle(new Request($method, '/api/favorite', [], $origin, $body));
    }

    private function on(string $id): ApiResponse
    {
        return $this->star(json_encode(['id' => $id, 'on' => true]));
    }

    private function off(string $id): ApiResponse
    {
        return $this->star(json_encode(['id' => $id, 'on' => false]));
    }

    private function counts(): ApiResponse
    {
        return $this->router->handle(new Request('GET', '/api/favorites', [], self::ORIGIN, ''));
    }

    public function testStarringAListedStreamCountsOne(): void
    {
        $id = $this->stream('alpha');

        $response = $this->on($id);

        $this->assertSame(204, $response->status);
        $this->assertSame('no-store', $response->headers['Cache-Control']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
        $this->assertSame(1, (new FavoriteStore($this->pdo, $this->clock))->countFor($id));
    }

    public function testManyVisitorsAddUp(): void
    {
        $id = $this->stream('alpha');

        $this->on($id);
        $this->on($id);
        $this->on($id);
        $this->off($id);

        $this->assertSame(2, (new FavoriteStore($this->pdo, $this->clock))->countFor($id));
    }

    public function testUnstarringNeverGoesBelowZero(): void
    {
        $id = $this->stream('alpha');

        $this->assertSame(204, $this->off($id)->status);
        $this->on($id);
        $this->off($id);
        $this->off($id);

        $this->assertSame(0, (new FavoriteStore($this->pdo, $this->clock))->countFor($id));
    }

    public function testAHiddenOrUnknownStreamIs404AndCountsNothing(): void
    {
        $dead = $this->stream('gone', 'dead');
        $suspect = $this->stream('maybe', 'suspect');

        $this->assertSame(404, $this->on($dead)->status);
        $this->assertSame(404, $this->on($suspect)->status);
        $this->assertSame(404, $this->on('0123456789ab')->status);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM stream_favorites')->fetchColumn());
    }

    public function testBadBodiesAre400(): void
    {
        $id = $this->stream('alpha');
        $bodies = [
            '', 'not json', '[]', '"x"', '{}', '{"id":"' . $id . '"}', '{"on":true}',
            '{"id":5,"on":true}', '{"id":"' . $id . '","on":"yes"}', '{"id":"' . $id . '","on":1}',
            '{"id":"ABCDEF012345","on":true}', '{"id":"short","on":true}', '{"id":"' . $id . 'ff","on":true}',
        ];
        foreach ($bodies as $body) {
            $this->assertSame(400, $this->star($body)->status, $body);
        }
        $this->assertSame(413, $this->star(str_repeat('x', 1025))->status);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM stream_favorites')->fetchColumn());
    }

    public function testTheCapAnswers429AfterTheLimit(): void
    {
        $id = $this->stream('alpha');
        for ($i = 0; $i < 300; $i++) {
            $this->assertSame(204, $this->on($id)->status, "star {$i}");
        }

        $capped = $this->on($id);

        $this->assertSame(429, $capped->status);
        $this->assertSame('60', $capped->headers['Retry-After']);
        $this->assertSame(300, (new FavoriteStore($this->pdo, $this->clock))->countFor($id));

        $this->clock->advanceMs(60_000);
        $this->assertSame(204, $this->on($id)->status, 'the next minute starts again');
    }

    public function testWrongMethodsAre405(): void
    {
        $this->assertSame('POST, OPTIONS', $this->star('', 'GET')->headers['Allow']);
        $this->assertSame(405, $this->star('', 'GET')->status);

        $response = $this->router->handle(new Request('POST', '/api/favorites', [], self::ORIGIN, ''));
        $this->assertSame(405, $response->status);
        $this->assertSame('GET, OPTIONS', $response->headers['Allow']);
    }

    public function testADisallowedOriginIs403AndCountsNothing(): void
    {
        $id = $this->stream('alpha');

        $response = $this->star(json_encode(['id' => $id, 'on' => true]), 'POST', 'https://evil.example');

        $this->assertSame(403, $response->status);
        $this->assertSame(0, (new FavoriteStore($this->pdo, $this->clock))->countFor($id));
    }

    public function testCountsListsOnlyListedStreamsWithAStarMostStarredFirst(): void
    {
        $a = $this->stream('alpha');
        $b = $this->stream('beta');
        $this->stream('quiet'); // never starred
        $this->on($a);
        $this->on($b);
        $this->on($b);

        $response = $this->counts();

        $this->assertSame(200, $response->status);
        $this->assertSame('public, max-age=60', $response->headers['Cache-Control']);
        $body = json_decode($response->body, true);
        $this->assertSame(1, $body['v']);
        $this->assertSame([$b => 2, $a => 1], $body['counts']);
        $this->assertSame([$b, $a], array_keys($body['counts']));
    }

    public function testCountsHidesAStreamThatIsNoLongerListed(): void
    {
        $id = $this->stream('alpha');
        $this->on($id);
        $this->pdo->prepare("UPDATE streams SET state = 'dead' WHERE public_id = ?")->execute([$id]);

        $this->assertSame([], json_decode($this->counts()->body, true)['counts']);
    }

    public function testNoStarsIsAnEmptyObjectNotAnArray(): void
    {
        $this->assertSame('{"v":1,"counts":{}}', $this->counts()->body);
    }

    public function testThePreflightAllowsTheCrossOriginPost(): void
    {
        $response = $this->router->handle(new Request('OPTIONS', '/api/favorite', [], self::ORIGIN, ''));

        $this->assertSame(204, $response->status);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
    }
}
