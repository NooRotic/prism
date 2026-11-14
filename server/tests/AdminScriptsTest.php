<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Http\CurlHttp;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\BuiltInServer;
use Prism\History\Tests\Support\ConfigFile;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\Tests\Support\World;

final class AdminScriptsTest extends DbTestCase
{
    private const ROOT = __DIR__ . '/..';

    private ConfigFile $configs;

    /** @var list<BuiltInServer> */
    private array $servers = [];

    /** @var list<string> */
    private array $generated = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->configs = new ConfigFile();
    }

    protected function tearDown(): void
    {
        $this->configs->cleanUp();
        foreach ($this->servers as $server) {
            $server->stop();
        }
        foreach ($this->generated as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }

    /** @return array{0:int,1:string,2:string} exit code, stdout, stderr */
    private function script(string $script, array $args, string $configPath): array
    {
        $process = proc_open(
            [PHP_BINARY, self::ROOT . '/bin/' . $script, ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PRISM_HISTORY_CONFIG' => $configPath]),
        );
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);

        return [proc_close($process), $out, $err];
    }

    /** @return list<string> */
    private function tables(): array
    {
        return $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    }

    private function serve(string $docroot, ?string $router, string $configPath): BuiltInServer
    {
        $server = BuiltInServer::start($docroot, $router, ['PRISM_HISTORY_CONFIG' => $configPath]);
        $this->servers[] = $server;

        return $server;
    }

    public function testInstallAppliesMigrationsAndIsIdempotent(): void
    {
        Database::dropAll($this->pdo);
        $config = $this->configs->write();

        [$code, $out] = $this->script('install.php', [], $config);
        $this->assertSame(0, $code);
        $this->assertSame("applied 001_schema\napplied 002_admin\napplied 003_streams\n", $out);
        $this->assertContains('channels', $this->tables());
        $this->assertContains('tt_gate', $this->tables());

        [$code2, $out2] = $this->script('install.php', [], $config);
        $this->assertSame(0, $code2);
        $this->assertSame('', $out2);
    }

    public function testInstallFailsCleanlyWithABrokenConfig(): void
    {
        [$code, $out, $err] = $this->script('install.php', [], '/definitely/not/here/config.php');

        $this->assertSame(1, $code);
        $this->assertStringContainsString('install failed', $err);
        $this->assertStringNotContainsString('not/here', $out . $err);
    }

    public function testRemoveChannelDeletesRowsAndBlocksTheLogin(): void
    {
        $channels = new ChannelStore($this->pdo, $this->clock);
        $channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $channels->insertTracked(Fixtures::user('2', 'alice'), null);
        $channels->insertTracked(Fixtures::user('3', 'bob'), null);
        (new SnapshotStore($this->pdo, $this->clock))->upsert('1', '2026-11-12', World::summary(), 'ok');
        (new BioLinkStore($this->pdo, $this->clock))->sync('2', [['platform' => 'kick', 'url' => 'https://kick.com/alice']]);

        [$code, $out] = $this->script('remove-channel.php', ['Alice'], $this->configs->write());

        $this->assertSame(0, $code);
        $this->assertSame("removed channels=2 blocked=2\n", $out);
        $this->assertSame(['3'], $this->pdo->query('SELECT twitch_id FROM channels')->fetchAll(PDO::FETCH_COLUMN));
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn());
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM bio_links')->fetchColumn());
        $this->assertTrue($channels->isBlockedId('1'));
        $this->assertTrue($channels->isBlockedId('2'));
        $this->assertTrue($channels->isBlockedLogin('alice'));
        $this->assertFalse($channels->isBlockedLogin('bob'));
    }

    public function testRemoveChannelForAnUnknownLoginPrintsZeroAndExitsZero(): void
    {
        [$code, $out] = $this->script('remove-channel.php', ['nobody'], $this->configs->write());

        $this->assertSame(0, $code);
        $this->assertSame("removed channels=0 blocked=0\n", $out);
    }

    public function testRemoveChannelNeedsAValidLoginAndChangesNothingWithout(): void
    {
        (new ChannelStore($this->pdo, $this->clock))->insertTracked(Fixtures::user('1', 'alice'), null);
        $config = $this->configs->write();

        foreach ([[], ['a b'], [''], [str_repeat('a', 26)]] as $args) {
            [$code, , $err] = $this->script('remove-channel.php', $args, $config);

            $this->assertSame(2, $code, json_encode($args));
            $this->assertStringContainsString('usage', $err);
        }
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM channels')->fetchColumn());
    }

    public function testTwitchIdScriptNeedsAValidLoginAndMakesNoRequestOtherwise(): void
    {
        $config = $this->configs->write();

        foreach ([[], ['a b'], [''], [str_repeat('a', 26)]] as $args) {
            [$code, , $err] = $this->script('twitch-id.php', $args, $config);

            $this->assertSame(2, $code, json_encode($args));
            $this->assertStringContainsString('usage', $err);
        }
    }

    public function testChannelStoreFindsEveryIdForALogin(): void
    {
        $channels = new ChannelStore($this->pdo, $this->clock);
        $channels->insertTracked(Fixtures::user('2', 'alice'), null);
        $channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $channels->insertTracked(Fixtures::user('3', 'bob'), null);

        $this->assertSame(['1', '2'], $channels->idsByLogin('ALICE'));
        $this->assertSame([], $channels->idsByLogin('nobody'));
    }

    public function testScriptsRefuseToRunOverTheWeb(): void
    {
        Database::dropAll($this->pdo);
        $server = $this->serve(self::ROOT . '/bin', null, $this->configs->write());

        foreach (['/install.php', '/remove-channel.php', '/refresh.php', '/twitch-id.php'] as $path) {
            $response = (new CurlHttp())->request('GET', $server->url($path));

            $this->assertSame(404, $response->status, $path);
            $this->assertSame('', $response->body, $path);
        }
        $this->assertSame([], $this->tables());
    }

    private function installerWithToken(string $token): string
    {
        $name = 'install-test-' . bin2hex(random_bytes(4)) . '.php';
        $path = self::ROOT . '/public/' . $name;
        file_put_contents($path, str_replace('__TOKEN__', $token, (string) file_get_contents(self::ROOT . '/tools/web-install.template.php')));
        $this->generated[] = $path;

        return $name;
    }

    public function testWebInstallerRequiresTheExactToken(): void
    {
        Database::dropAll($this->pdo);
        $token = bin2hex(random_bytes(16));
        $name = $this->installerWithToken($token);
        $server = $this->serve(self::ROOT . '/public', null, $this->configs->write());
        $http = new CurlHttp();

        foreach (['', '?t=', '?t=wrong', '?t=' . substr($token, 0, 31), '?t[]=' . $token] as $query) {
            $response = $http->request('GET', $server->url('/' . $name . $query));

            $this->assertSame(403, $response->status, $query);
            $this->assertSame('', $response->body, $query);
        }
        $this->assertSame([], $this->tables());

        $ok = $http->request('GET', $server->url('/' . $name . '?t=' . $token));

        $this->assertSame(200, $ok->status);
        $this->assertStringContainsString('applied 001_schema', $ok->body);
        $this->assertContains('channels', $this->tables());
    }

    public function testTheUnfilledWebInstallerTemplateRefusesEveryRequest(): void
    {
        Database::dropAll($this->pdo);
        $name = $this->installerWithToken('__TOKEN__');
        $server = $this->serve(self::ROOT . '/public', null, $this->configs->write());

        $response = (new CurlHttp())->request('GET', $server->url('/' . $name . '?t=__TOKEN__'));

        $this->assertSame(403, $response->status);
        $this->assertSame([], $this->tables());
    }

    public function testWebInstallerAnswersAFailureWithoutDetail(): void
    {
        $token = bin2hex(random_bytes(16));
        $name = $this->installerWithToken($token);
        $server = $this->serve(self::ROOT . '/public', null, '/definitely/not/here/config.php');

        $response = (new CurlHttp())->request('GET', $server->url('/' . $name . '?t=' . $token));

        $this->assertSame(500, $response->status);
        $this->assertSame("install failed\n", $response->body);
    }
}
