<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\Tests\Support\World;

final class AdminChannelsTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const STRANGER_TOKEN = 'strangertoken012345678strangerx';

    private World $world;
    private ChannelStore $channels;
    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'theowner', 'front');
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->logPath = sys_get_temp_dir() . '/prism-adminch-' . bin2hex(random_bytes(3)) . '.log';
    }

    protected function tearDown(): void
    {
        if (is_file($this->logPath)) {
            unlink($this->logPath);
        }
    }

    /** @param array<string,string> $query */
    private function call(string $method, string $path, array $query = [], string $body = '', ?string $token = self::OWNER_TOKEN): ApiResponse
    {
        $config = World::config(['log_path' => $this->logPath, 'admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front']]);
        $router = Container::router($config, $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));

        return $router->handle(new Request($method, $path, $query, self::ORIGIN, $body, $token === null ? null : 'Bearer ' . $token));
    }

    /** @return array<string,mixed> */
    private function json(ApiResponse $response): array
    {
        return json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
    }

    private function track(string $id, string $login, string $displayName = ''): void
    {
        $this->channels->insertTracked(Fixtures::user($id, $login, ['displayName' => $displayName !== '' ? $displayName : ucfirst($login)]), null);
    }

    private function rows(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    private function remove(string $id): ApiResponse
    {
        return $this->call('POST', '/api/admin/channels/remove', [], json_encode(['twitch_id' => $id], JSON_THROW_ON_ERROR));
    }

    public function testListSearchesLoginAndDisplayNameAndShowsTheLatestTtStatus(): void
    {
        $this->track('1', 'alice');
        $this->track('2', 'bob', 'The Builder');
        $this->track('3', 'under_score');
        $this->track('4', 'underXscore');
        $snapshots = new SnapshotStore($this->pdo, $this->clock);
        $snapshots->upsert('1', '2026-11-11', World::summary(), 'ok');
        $snapshots->upsert('1', '2026-11-12', [], 'error');

        $all = $this->json($this->call('GET', '/api/admin/channels'))['channels'];
        $this->assertCount(4, $all);
        $alice = array_values(array_filter($all, static fn (array $c): bool => $c['login'] === 'alice'))[0];
        $this->assertSame(
            ['twitch_id' => '1', 'login' => 'alice', 'display_name' => 'Alice', 'status' => 'tracking', 'tracked_since' => '2026-11-12', 'last_visited_at' => '2026-11-12 03:00:00', 'tt_status' => 'error'],
            $alice,
        );

        $logins = static fn (array $body): array => array_column($body['channels'], 'login');
        $this->assertSame(['alice'], $logins($this->json($this->call('GET', '/api/admin/channels', ['q' => 'ali']))));
        $this->assertSame(['bob'], $logins($this->json($this->call('GET', '/api/admin/channels', ['q' => 'build']))));
        $this->assertSame(['under_score'], $logins($this->json($this->call('GET', '/api/admin/channels', ['q' => 'r_s']))), 'an underscore means itself, not any character');
        $bob = array_values(array_filter($all, static fn (array $c): bool => $c['login'] === 'bob'))[0];
        $this->assertNull($bob['tt_status']);
    }

    public function testListAlsoReturnsTheBlockedChannels(): void
    {
        $this->track('1', 'alice');
        $this->channels->block('9', 'banned');

        $body = $this->json($this->call('GET', '/api/admin/channels'));

        $this->assertCount(1, $body['channels']);
        $this->assertSame([['twitch_id' => '9', 'login' => 'banned', 'blocked_at' => '2026-11-12 03:00:00']], $body['blocked']);
    }

    public function testQueryMustLookLikeALoginFragment(): void
    {
        foreach (['a b', str_repeat('a', 26), 'ünï', 'a%'] as $bad) {
            $response = $this->call('GET', '/api/admin/channels', ['q' => $bad]);

            $this->assertSame(400, $response->status, $bad);
            $this->assertSame(['error' => 'bad_query'], $this->json($response));
        }
    }

    public function testRemoveDeletesRowsBlocksTheLoginAndWritesOneAuditRow(): void
    {
        $this->track('1', 'alice');
        $this->track('2', 'bob');
        (new SnapshotStore($this->pdo, $this->clock))->upsert('1', '2026-11-12', World::summary(), 'ok');

        $response = $this->remove('1');

        $this->assertSame(200, $response->status);
        $this->assertSame(['ok' => true], $this->json($response));
        $this->assertSame(['2'], $this->pdo->query('SELECT twitch_id FROM channels')->fetchAll(\PDO::FETCH_COLUMN));
        $this->assertSame(0, $this->rows('snapshots'));
        $this->assertTrue($this->channels->isBlockedId('1'));
        $this->assertSame(1, $this->rows('admin_audit'));
        $audit = $this->pdo->query('SELECT action, target, detail FROM admin_audit')->fetch(\PDO::FETCH_ASSOC);
        $this->assertSame(['action' => 'channel.remove', 'target' => 'alice', 'detail' => 'twitch_id=1'], $audit);

        $visit = $this->call('POST', '/api/visit', [], '{"login":"alice"}', null);
        $this->assertSame(404, $visit->status);
        $this->assertSame(['tracked' => false], $this->json($visit));
    }

    public function testRemovingTwiceOrAnUnknownIdIsNotFoundWithOneAuditRowInTotal(): void
    {
        $this->track('1', 'alice');

        $this->assertSame(200, $this->remove('1')->status);
        $again = $this->remove('1');
        $unknown = $this->remove('424242');

        $this->assertSame(404, $again->status);
        $this->assertSame(['error' => 'not_found'], $this->json($again));
        $this->assertSame(404, $unknown->status);
        $this->assertSame(1, $this->rows('admin_audit'));
    }

    public function testAFailingAuditWriteLeavesTheChannelInPlace(): void
    {
        $this->track('1', 'alice');
        $this->pdo->exec('DROP TABLE admin_audit');

        $response = $this->remove('1');

        $this->assertSame(500, $response->status);
        $this->assertSame(1, $this->rows('channels'));
        $this->assertFalse($this->channels->isBlockedId('1'));
        $this->assertFalse($this->pdo->inTransaction());
    }

    public function testUnblockRemovesTheBlockAndAudits(): void
    {
        $this->channels->block('9', 'banned');

        $response = $this->call('POST', '/api/admin/channels/unblock', [], '{"twitch_id":"9"}');

        $this->assertSame(200, $response->status);
        $this->assertSame(['ok' => true], $this->json($response));
        $this->assertFalse($this->channels->isBlockedId('9'));
        $audit = $this->pdo->query('SELECT action, target, detail FROM admin_audit')->fetch(\PDO::FETCH_ASSOC);
        $this->assertSame(['action' => 'channel.unblock', 'target' => 'banned', 'detail' => 'twitch_id=9'], $audit);

        $again = $this->call('POST', '/api/admin/channels/unblock', [], '{"twitch_id":"9"}');
        $this->assertSame(404, $again->status);
        $this->assertSame(1, $this->rows('admin_audit'));
    }

    public function testBadBodiesAre400(): void
    {
        $bodies = ['', '{}', '[]', 'not json', '{"twitch_id":"abc"}', '{"twitch_id":"' . str_repeat('1', 21) . '"}', '{"twitch_id":["1"]}', '{"twitch_id":1}', '{"twitch_id":""}'];
        foreach (['remove', 'unblock'] as $action) {
            foreach ($bodies as $body) {
                $response = $this->call('POST', '/api/admin/channels/' . $action, [], $body);

                $this->assertSame(400, $response->status, $action . ' ' . $body);
                $this->assertSame(['error' => 'bad_request'], $this->json($response));
            }
        }
        $this->assertSame(0, $this->rows('admin_audit'));
    }

    public function testWrongMethodsAre405(): void
    {
        $this->assertSame('GET, OPTIONS', $this->call('POST', '/api/admin/channels')->headers['Allow']);
        $this->assertSame('POST, OPTIONS', $this->call('GET', '/api/admin/channels/remove')->headers['Allow']);
        $this->assertSame('POST, OPTIONS', $this->call('GET', '/api/admin/channels/unblock')->headers['Allow']);
    }

    public function testANonOwnerCannotRemoveAnything(): void
    {
        $this->track('1', 'alice');
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');

        $stranger = $this->call('POST', '/api/admin/channels/remove', [], '{"twitch_id":"1"}', self::STRANGER_TOKEN);
        $nobody = $this->call('POST', '/api/admin/channels/remove', [], '{"twitch_id":"1"}', null);

        $this->assertSame(403, $stranger->status);
        $this->assertSame(401, $nobody->status);
        $this->assertSame(1, $this->rows('channels'));
        $this->assertSame(0, $this->rows('admin_audit'));
    }
}
