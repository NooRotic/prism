<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Container;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

final class AdminPlaylistTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const STRANGER_TOKEN = 'strangertoken012345678strangerx';

    private World $world;
    private StreamStore $store;
    private string $root;
    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'theowner', 'front');
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->root = sys_get_temp_dir() . '/prism-adminpl-' . bin2hex(random_bytes(4));
        $this->logPath = $this->root . '.log';
    }

    protected function tearDown(): void
    {
        self::removeTree($this->root);
        if (is_file($this->logPath)) {
            unlink($this->logPath);
        }
    }

    private static function removeTree(string $path): void
    {
        if (is_file($path)) {
            unlink($path);

            return;
        }
        foreach (glob($path . '/{,.}*', GLOB_BRACE) ?: [] as $entry) {
            if (!in_array(basename($entry), ['.', '..'], true)) {
                self::removeTree($entry);
            }
        }
        if (is_dir($path)) {
            rmdir($path);
        }
    }

    private function dataDir(): string
    {
        return $this->root . '/data';
    }

    private function logoDir(): string
    {
        return $this->root . '/logos';
    }

    /** @param array<string,string> $query */
    private function call(string $method, string $path, array $query = [], string $body = '', ?string $token = self::OWNER_TOKEN): ApiResponse
    {
        $config = World::config([
            'log_path' => $this->logPath,
            'admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front'],
            'playlist' => ['data_dir' => $this->dataDir(), 'logo_dir' => $this->logoDir()],
        ]);
        $router = Container::router($config, $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));

        return $router->handle(new Request($method, $path, $query, self::ORIGIN, $body, $token === null ? null : 'Bearer ' . $token));
    }

    /** @param array<string,mixed> $body */
    private function post(string $action, array $body, ?string $token = self::OWNER_TOKEN): ApiResponse
    {
        return $this->call('POST', '/api/admin/streams/' . $action, [], json_encode($body, JSON_THROW_ON_ERROR), $token);
    }

    /** @return array<string,mixed> */
    private function json(ApiResponse $response): array
    {
        return json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @param array<string,mixed> $extra @return string the public id */
    private function stream(string $name, array $extra = []): string
    {
        $url = 'https://' . strtolower(preg_replace('/[^A-Za-z0-9]/', '', $name)) . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        $this->store->insertIfNew(array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => $name, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test', 'added_at' => '2026-11-12 03:00:00',
        ], $extra));

        return StreamUrl::publicId($id);
    }

    private function rows(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    /** @return array<string,mixed> */
    private function row(string $publicId): array
    {
        $row = $this->pdo->query("SELECT * FROM streams WHERE public_id = '{$publicId}'")->fetch(PDO::FETCH_ASSOC);
        $this->assertIsArray($row);

        return $row;
    }

    /** @return array<string,mixed> */
    private function audit(): array
    {
        return $this->pdo->query('SELECT action, target, detail FROM admin_audit ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<string,mixed> */
    private function snapshot(): array
    {
        return json_decode((string) file_get_contents($this->dataDir() . '/streams.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    private function seedList(): void
    {
        $this->stream('Alpha News', ['state' => 'working', 'pinned' => 1, 'groups_json' => '["News"]', 'country' => 'us']);
        $this->stream('Beta Sports', ['groups_json' => '["Sports","News"]', 'country' => 'gb']);
        $this->stream('Gamma 100%', ['groups_json' => '["Other"]']);
        $this->stream('Delta', ['state' => 'held', 'state_reason' => 'port', 'groups_json' => '["News"]']);
        $this->stream('Epsilon', ['state' => 'removed']);
        $this->stream('Zeta_1', ['state' => 'dead', 'country' => 'us', 'groups_json' => '["Other"]']);
    }

    /** @param array<string,string> $query @return list<string> */
    private function listed(array $query): array
    {
        $response = $this->call('GET', '/api/admin/streams', $query);
        $this->assertSame(200, $response->status, json_encode($query));

        return array_column($this->json($response)['streams'], 'name');
    }

    // ---- the list

    public function testListFiltersAndPaginates(): void
    {
        $this->seedList();

        $all = $this->json($this->call('GET', '/api/admin/streams'));
        $this->assertSame(6, $all['total']);
        $this->assertSame(['Alpha News', 'Beta Sports', 'Delta', 'Epsilon', 'Gamma 100%', 'Zeta_1'], array_column($all['streams'], 'name'), 'pinned first, then by name');
        $this->assertSame(['dead' => 1, 'held' => 1, 'new' => 2, 'removed' => 1, 'working' => 1], $all['counts']);

        $this->assertSame(['Beta Sports'], $this->listed(['text' => 'beta']));
        $this->assertSame(['Alpha News'], $this->listed(['text' => 'a n']), 'every word must match');
        $this->assertSame(['Gamma 100%'], $this->listed(['text' => '100%']), 'a percent sign means itself');
        $this->assertSame(['Zeta_1'], $this->listed(['text' => '_1']), 'an underscore means itself');
        $this->assertSame(['Delta'], $this->listed(['state' => 'held']));
        $this->assertSame(['Epsilon'], $this->listed(['state' => 'removed']), 'the owner sees tombstones');
        $this->assertSame(['Alpha News', 'Beta Sports', 'Delta', 'Epsilon'], $this->listed(['group' => 'News']), 'a tombstone still has its groups');
        $this->assertSame(['Gamma 100%', 'Zeta_1'], $this->listed(['group' => 'Other']));
        $this->assertSame(['Alpha News', 'Zeta_1'], $this->listed(['country' => 'us']));
        $this->assertSame(['Beta Sports'], $this->listed(['state' => 'new', 'group' => 'News']));
        $this->assertSame([], $this->listed(['text' => 'nothing like this']));

        $page = $this->json($this->call('GET', '/api/admin/streams', ['limit' => '2', 'offset' => '1']));
        $this->assertSame(['Beta Sports', 'Delta'], array_column($page['streams'], 'name'));
        $this->assertSame([6, 2, 1], [$page['total'], $page['limit'], $page['offset']], 'the total is the whole filtered list, not the page');
    }

    public function testListRowsCarryWhatTheScreenNeeds(): void
    {
        $id = $this->stream('Alpha News', ['state' => 'working', 'pinned' => 1, 'is_default' => 1, 'country' => 'us', 'groups_json' => '["News","Sports"]', 'logo_file' => 'abcdef012345.png']);

        $row = $this->json($this->call('GET', '/api/admin/streams'))['streams'][0];

        $this->assertSame(
            ['public_id' => $id, 'name' => 'Alpha News', 'url' => 'https://alphanews.test/live.m3u8', 'groups' => ['News', 'Sports'], 'country' => 'us', 'kind' => 'hls', 'state' => 'working', 'state_reason' => null, 'pinned' => true, 'is_default' => true, 'source' => 'test', 'has_logo' => true, 'added_at' => '2026-11-12 03:00:00'],
            $row,
        );
    }

    public function testListQueryMustBeValid(): void
    {
        $bad = [
            ['text' => str_repeat('a', 101)], ['state' => 'bogus'], ['country' => 'USA'], ['country' => 'u'], ['group' => str_repeat('g', 41)],
            ['limit' => '0'], ['limit' => '201'], ['limit' => 'abc'], ['offset' => '-1'], ['offset' => 'abc'], ['limit' => '1.5'], ['text' => "bad\x00text"],
        ];
        foreach ($bad as $query) {
            $response = $this->call('GET', '/api/admin/streams', $query);

            $this->assertSame(400, $response->status, json_encode($query));
            $this->assertSame(['error' => 'bad_query'], $this->json($response));
        }
        $this->assertSame(400, $this->call('GET', '/api/admin/streams', ['text' => ['a']])->status);
    }

    // ---- add

    public function testAddAppliesTheImportRules(): void
    {
        foreach ([
            ['https://user:pw@a.test/x.m3u8', 'credentials'],
            ['https://a.test/x.m3u8?token=abc', 'token'],
            ['ftp://a.test/x', 'bad_address'],
            ['https://exa<mple.com/x.m3u8', 'bad_address'],
            ['not an address', 'bad_address'],
        ] as [$url, $reason]) {
            $response = $this->post('add', ['url' => $url, 'name' => 'A stream', 'group' => 'News']);

            $this->assertSame(422, $response->status, $url);
            $this->assertSame(['error' => 'rejected', 'reason' => $reason], $this->json($response), $url);
        }
        $adult = $this->post('add', ['url' => 'https://a.test/x.m3u8', 'name' => 'A stream', 'group' => 'News;XXX']);
        $this->assertSame(['error' => 'rejected', 'reason' => 'adult'], $this->json($adult));
        $this->assertSame([0, 0], [$this->rows('streams'), $this->rows('admin_audit')], 'nothing was stored or audited');

        $http = $this->json($this->post('add', ['url' => 'http://a.test/x.m3u8', 'name' => 'Plain http', 'group' => '']));
        $this->assertSame(['unplayable', 'http'], [$this->row($http['public_id'])['state'], $this->row($http['public_id'])['state_reason']]);
        $this->assertSame(['unplayable', 'http'], [$http['state'], $http['state_reason']], 'the answer says the stream is hidden from visitors, and why');
        $held = $this->json($this->post('add', ['url' => 'https://b.test:8443/x.m3u8', 'name' => 'Odd port', 'group' => '']));
        $this->assertSame(['held', 'port'], [$this->row($held['public_id'])['state'], $this->row($held['public_id'])['state_reason']]);
        $this->assertSame(['held', 'port'], [$held['state'], $held['state_reason']]);
        $dash = $this->json($this->post('add', ['url' => 'https://c.test/live/manifest.mpd', 'name' => 'Dash one', 'group' => '']));
        $this->assertSame(['dash', '["Other"]'], [$this->row($dash['public_id'])['kind'], $this->row($dash['public_id'])['groups_json']]);
    }

    public function testAddStoresTheStreamAuditsItAndRefreshesTheSnapshot(): void
    {
        $response = $this->post('add', ['url' => 'HTTPS://Example.COM:443/Live/A.m3u8#frag', 'name' => '  <b>My stream</b>  ', 'group' => 'News; Sports ;']);

        $this->assertSame(200, $response->status);
        $body = $this->json($response);
        $this->assertTrue($body['ok']);
        $this->assertTrue($body['snapshot']);
        $this->assertSame(['new', null], [$body['state'], $body['state_reason']], 'a normal address is listed, as unchecked');
        $this->assertSame(StreamUrl::publicId(StreamUrl::id('https://example.com/Live/A.m3u8')), $body['public_id']);

        $row = $this->row($body['public_id']);
        $this->assertSame(['<b>My stream</b>', 'https://example.com/Live/A.m3u8', '["News","Sports"]', 'new', 'manual', 'hls', 0, 0], [
            $row['name'], $row['url'], $row['groups_json'], $row['state'], $row['source'], $row['kind'], (int) $row['pinned'], (int) $row['is_default'],
        ]);
        $audit = $this->audit();
        $this->assertSame(['stream.add', '<b>My stream</b>', 'public_id=' . $body['public_id']], [$audit['action'], $audit['target'], $audit['detail']]);
        $this->assertSame(1, $this->rows('admin_audit'));
        $this->assertSame(['<b>My stream</b>'], array_column($this->snapshot()['streams'], 'n'), 'the visitor list has it at once');
    }

    public function testAddKnownAddressIsAlreadyKnown(): void
    {
        $first = $this->json($this->post('add', ['url' => 'https://example.com/a.m3u8', 'name' => 'One', 'group' => '']));

        $again = $this->post('add', ['url' => 'HTTPS://EXAMPLE.com:443/a.m3u8#other', 'name' => 'Two', 'group' => 'News']);

        $this->assertSame(409, $again->status);
        $this->assertSame(['error' => 'already_known', 'public_id' => $first['public_id']], $this->json($again));
        $this->assertSame([1, 1], [$this->rows('streams'), $this->rows('admin_audit')]);
        $this->assertSame('One', $this->row($first['public_id'])['name'], 'the known stream is untouched');
    }

    public function testAnAddressOfARemovedStreamIsStillKnown(): void
    {
        $added = $this->json($this->post('add', ['url' => 'https://example.com/a.m3u8', 'name' => 'One', 'group' => '']));
        $this->post('remove', ['public_id' => $added['public_id']]);

        $again = $this->post('add', ['url' => 'https://example.com/a.m3u8', 'name' => 'One again', 'group' => '']);

        $this->assertSame(409, $again->status);
        $this->assertSame('removed', $this->row($added['public_id'])['state']);
    }

    public function testAddNeedsAUsableName(): void
    {
        foreach (['', '   ', str_repeat('n', 201), "bad\x00name", "line\nbreak"] as $name) {
            $response = $this->post('add', ['url' => 'https://example.com/a.m3u8', 'name' => $name, 'group' => '']);

            $this->assertSame(422, $response->status, json_encode($name));
            $this->assertSame(['error' => 'rejected', 'reason' => 'bad_name'], $this->json($response));
        }
        $this->assertSame(0, $this->rows('streams'));
    }

    public function testAddStillAnswersOkWhenOnlyTheSnapshotCannotBeWritten(): void
    {
        mkdir($this->root);
        file_put_contents($this->dataDir(), 'a file where the folder should be');

        $response = $this->post('add', ['url' => 'https://example.com/a.m3u8', 'name' => 'One', 'group' => '']);

        $this->assertSame(200, $response->status);
        $body = $this->json($response);
        $this->assertTrue($body['ok']);
        $this->assertFalse($body['snapshot'], 'the screen is told the visitor list is behind');
        $this->assertSame(1, $this->rows('streams'));
        $this->assertSame(1, $this->rows('admin_audit'));
    }

    // ---- update, pin, default, remove

    public function testUpdateRenamesAndRegroups(): void
    {
        $id = $this->stream('Old name', ['state' => 'working', 'groups_json' => '["News"]']);

        $response = $this->post('update', ['public_id' => $id, 'name' => ' <i>New</i> name ', 'groups' => ['Sports', ' Music ', '', 'Sports', str_repeat('g', 60)]]);

        $this->assertSame(200, $response->status);
        $this->assertSame(['ok' => true, 'snapshot' => true], $this->json($response));
        $row = $this->row($id);
        $this->assertSame('<i>New</i> name', $row['name']);
        $this->assertSame(['Sports', 'Music', str_repeat('g', 40)], json_decode($row['groups_json'], true), 'trimmed, de-duplicated, each cut to 40');
        $audit = $this->audit();
        $this->assertSame('stream.update', $audit['action']);
        $this->assertStringContainsString($id, $audit['detail']);
        $this->assertSame(['<i>New</i> name'], array_column($this->snapshot()['streams'], 'n'));

        $this->post('update', ['public_id' => $id, 'name' => 'Same', 'groups' => []]);
        $this->assertSame(['Other'], json_decode($this->row($id)['groups_json'], true), 'no group at all means Other');
        $this->assertSame(2, $this->rows('admin_audit'));
    }

    public function testUpdateRefusesAnAdultGroupAndABadName(): void
    {
        $id = $this->stream('Keep', ['state' => 'working', 'groups_json' => '["News"]']);

        $adult = $this->post('update', ['public_id' => $id, 'name' => 'Keep', 'groups' => ['News', 'XXX']]);
        $name = $this->post('update', ['public_id' => $id, 'name' => "bad\x00", 'groups' => []]);

        $this->assertSame([422, ['error' => 'rejected', 'reason' => 'adult']], [$adult->status, $this->json($adult)]);
        $this->assertSame([422, ['error' => 'rejected', 'reason' => 'bad_name']], [$name->status, $this->json($name)]);
        $this->assertSame(['News'], json_decode($this->row($id)['groups_json'], true));
        $this->assertSame(0, $this->rows('admin_audit'));
    }

    public function testUpdatePinDefaultAndRemoveEachWriteOneAuditRowAndRewriteTheSnapshot(): void
    {
        $a = $this->stream('Alpha', ['state' => 'working']);
        $b = $this->stream('Beta', ['state' => 'working']);
        $this->post('update', ['public_id' => $a, 'name' => 'Alpha 2', 'groups' => ['News']]);
        $this->assertSame(['stream.update', 1], [$this->audit()['action'], $this->rows('admin_audit')]);
        $this->assertSame(['Alpha 2', 'Beta'], array_column($this->snapshot()['streams'], 'n'));

        $this->assertSame(200, $this->post('pin', ['public_id' => $b, 'pinned' => true])->status);
        $this->assertSame(['stream.pin', 2], [$this->audit()['action'], $this->rows('admin_audit')]);
        $this->assertSame(1, (int) $this->row($b)['pinned']);
        $this->assertSame(['Beta', 'Alpha 2'], array_column($this->snapshot()['streams'], 'n'), 'a pinned stream goes first');
        $this->post('pin', ['public_id' => $b, 'pinned' => false]);
        $this->assertSame(0, (int) $this->row($b)['pinned']);
        $this->assertSame(3, $this->rows('admin_audit'));

        $this->assertSame(200, $this->post('default', ['public_id' => $a])->status);
        $this->assertSame(['stream.default', 4], [$this->audit()['action'], $this->rows('admin_audit')]);
        $this->assertSame($a, $this->snapshot()['default']);
        $this->post('default', ['public_id' => $b]);
        $this->assertSame($b, $this->snapshot()['default']);
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM streams WHERE is_default = 1')->fetchColumn(), 'exactly one default');

        $this->assertSame(200, $this->post('remove', ['public_id' => $a])->status);
        $this->assertSame(['stream.remove', 6], [$this->audit()['action'], $this->rows('admin_audit')]);
        $this->assertSame(['Beta'], array_column($this->snapshot()['streams'], 'n'));
    }

    public function testSetDefaultNeedsAStreamVisitorsCanSee(): void
    {
        $held = $this->stream('Held one', ['state' => 'held']);
        $dead = $this->stream('Dead one', ['state' => 'dead']);
        $removed = $this->stream('Removed one', ['state' => 'removed']);
        $ok = $this->stream('Fine', ['state' => 'working']);
        $this->post('default', ['public_id' => $ok]);

        foreach ([$held, $dead] as $id) {
            $response = $this->post('default', ['public_id' => $id]);
            $this->assertSame(409, $response->status);
            $this->assertSame(['error' => 'not_listed'], $this->json($response));
        }
        $this->assertSame(404, $this->post('default', ['public_id' => $removed])->status);
        $this->assertSame(404, $this->post('default', ['public_id' => '000000000000'])->status);
        $this->assertSame($ok, $this->snapshot()['default'], 'a refused change leaves the default alone');
        $this->assertSame(1, $this->rows('admin_audit'));
    }

    public function testRemovedStreamsAreTombstonesAndLeaveTheList(): void
    {
        mkdir($this->logoDir(), 0777, true);
        $id = $this->stream('Going', ['state' => 'working', 'pinned' => 1, 'is_default' => 1, 'logo_file' => 'abcdef012345.png']);
        file_put_contents($this->logoDir() . '/abcdef012345.png', "\x89PNG\r\n\x1a\n");
        file_put_contents($this->logoDir() . '/other.png', 'someone else\'s file');
        $url = 'https://going.test/live.m3u8';

        $this->assertSame(200, $this->post('remove', ['public_id' => $id])->status);

        $row = $this->row($id);
        $this->assertSame(['removed', 0, 0, null], [$row['state'], (int) $row['pinned'], (int) $row['is_default'], $row['logo_file']], 'kept as a tombstone, no longer default or pinned');
        $this->assertFileDoesNotExist($this->logoDir() . '/abcdef012345.png');
        $this->assertFileExists($this->logoDir() . '/other.png', 'only its own logo goes');
        $this->assertSame([], $this->snapshot()['streams']);
        $this->assertNull($this->snapshot()['default']);
        $this->assertFalse($this->store->insertIfNew(['id' => StreamUrl::id($url), 'public_id' => $id, 'url' => $url, 'name' => 'Back', 'groups_json' => '[]', 'kind' => 'hls', 'source' => 'x']), 'a re-import cannot bring it back');
    }

    public function testRemovingTwiceOrAnUnknownOrAnUnlistedIdIsNotFoundWithOneAuditRowInTotal(): void
    {
        $id = $this->stream('Going', ['state' => 'working']);

        $this->assertSame(200, $this->post('remove', ['public_id' => $id])->status);
        $again = $this->post('remove', ['public_id' => $id]);
        $unknown = $this->post('remove', ['public_id' => 'ffffffffffff']);

        $this->assertSame([404, ['error' => 'not_found']], [$again->status, $this->json($again)]);
        $this->assertSame(404, $unknown->status);
        $this->assertSame(1, $this->rows('admin_audit'));
        foreach (['update' => ['name' => 'x', 'groups' => []], 'pin' => ['pinned' => true], 'default' => []] as $action => $extra) {
            $this->assertSame(404, $this->post($action, ['public_id' => $id] + $extra)->status, $action . ' on a removed stream');
        }
    }

    public function testAFailingAuditLeavesTheStreamUnchanged(): void
    {
        $id = $this->stream('Keep', ['state' => 'working', 'groups_json' => '["News"]']);
        $other = $this->stream('Other', ['state' => 'working']);
        $this->post('default', ['public_id' => $other]);
        $before = (string) file_get_contents($this->dataDir() . '/streams.json');
        $stored = $this->row($id);
        $this->pdo->exec('DROP TABLE admin_audit');

        foreach ([
            ['add', ['url' => 'https://new.test/a.m3u8', 'name' => 'New', 'group' => '']],
            ['update', ['public_id' => $id, 'name' => 'Changed', 'groups' => ['X']]],
            ['pin', ['public_id' => $id, 'pinned' => true]],
            ['default', ['public_id' => $id]],
            ['remove', ['public_id' => $id]],
        ] as [$action, $body]) {
            $response = $this->post($action, $body);

            $this->assertSame(500, $response->status, $action);
            $this->assertFalse($this->pdo->inTransaction(), $action);
        }
        $this->assertSame($stored, $this->row($id), 'the stream is exactly as it was');
        $this->assertSame(2, $this->rows('streams'), 'the added stream was rolled back');
        $this->assertSame($other, $this->store->defaultPublicId());
        $this->assertSame($before, (string) file_get_contents($this->dataDir() . '/streams.json'), 'the visitor list was not touched');
    }

    public function testANonOwnerCannotChangeAnything(): void
    {
        $id = $this->stream('Keep', ['state' => 'working']);
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
        $stored = $this->row($id);

        foreach ([
            ['add', ['url' => 'https://new.test/a.m3u8', 'name' => 'New', 'group' => '']],
            ['update', ['public_id' => $id, 'name' => 'Changed', 'groups' => []]],
            ['pin', ['public_id' => $id, 'pinned' => true]],
            ['default', ['public_id' => $id]],
            ['remove', ['public_id' => $id]],
        ] as [$action, $body]) {
            $this->assertSame(403, $this->post($action, $body, self::STRANGER_TOKEN)->status, $action);
            $this->assertSame(401, $this->post($action, $body, null)->status, $action);
        }
        $this->assertSame(403, $this->call('GET', '/api/admin/streams', [], '', self::STRANGER_TOKEN)->status);
        $this->assertSame(401, $this->call('GET', '/api/admin/streams', [], '', null)->status);
        $this->assertSame($stored, $this->row($id));
        $this->assertSame([1, 0], [$this->rows('streams'), $this->rows('admin_audit')]);
    }

    public function testBadBodiesAre400(): void
    {
        $id = $this->stream('Keep', ['state' => 'working']);
        $bad = [
            'add' => [[], ['url' => 1, 'name' => 'x', 'group' => ''], ['url' => 'https://a.test/x', 'name' => ['x'], 'group' => ''], ['url' => 'https://a.test/x', 'name' => 'x'], ['url' => 'https://a.test/x', 'name' => 'x', 'group' => 5], ['name' => 'x', 'group' => ''], ['url' => str_repeat('a', 2001), 'name' => 'x', 'group' => '']],
            'update' => [[], ['public_id' => $id], ['public_id' => $id, 'name' => 'x'], ['public_id' => $id, 'name' => 'x', 'groups' => 'News'], ['public_id' => $id, 'name' => 'x', 'groups' => [1]], ['public_id' => $id, 'name' => 'x', 'groups' => ['a' => 'b']], ['public_id' => 'xyz', 'name' => 'x', 'groups' => []]],
            'pin' => [[], ['public_id' => $id], ['public_id' => $id, 'pinned' => 1], ['public_id' => $id, 'pinned' => 'true'], ['public_id' => 'ABCDEF012345', 'pinned' => true], ['pinned' => true]],
            'default' => [[], ['public_id' => 5], ['public_id' => 'short'], ['public_id' => ['aaaaaaaaaaaa']], ['public_id' => str_repeat('a', 13)]],
            'remove' => [[], ['public_id' => 5], ['public_id' => '../etc/passwd'], ['public_id' => ''], ['public_id' => 'aaaaaaaaaaa']],
        ];
        foreach ($bad as $action => $bodies) {
            foreach ($bodies as $body) {
                $response = $this->post($action, $body);

                $this->assertSame(400, $response->status, $action . ' ' . json_encode($body));
                $this->assertSame(['error' => 'bad_request'], $this->json($response));
            }
            foreach (['', 'not json', '[]', '"text"', 'null'] as $raw) {
                $this->assertSame(400, $this->call('POST', '/api/admin/streams/' . $action, [], $raw)->status, $action . ' ' . $raw);
            }
        }
        $this->assertSame([1, 0], [$this->rows('streams'), $this->rows('admin_audit')]);
    }

    public function testABodyOverFourKilobytesIsTooLargeButOneOverOneKilobyteIsFine(): void
    {
        $big = $this->call('POST', '/api/admin/streams/add', [], json_encode(['url' => 'https://a.test/' . str_repeat('a', 900), 'name' => 'Long address', 'group' => str_repeat('g', 100)], JSON_THROW_ON_ERROR));
        $this->assertSame(200, $big->status, 'an address of 900 characters makes a body past the old 1 KiB limit');

        $huge = $this->call('POST', '/api/admin/streams/add', [], str_repeat('x', 4097));
        $this->assertSame(413, $huge->status);
        $this->assertSame(['error' => 'too_large'], $this->json($huge));
    }

    public function testWrongMethodsAre405(): void
    {
        $this->assertSame('GET, OPTIONS', $this->call('POST', '/api/admin/streams')->headers['Allow']);
        foreach (['add', 'update', 'pin', 'default', 'remove'] as $action) {
            $this->assertSame('POST, OPTIONS', $this->call('GET', '/api/admin/streams/' . $action)->headers['Allow'], $action);
        }
        $this->assertSame(404, $this->call('POST', '/api/admin/streams/nope', [], '{}')->status);
    }
}
