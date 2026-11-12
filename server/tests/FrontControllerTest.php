<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Http\CurlHttp;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;
use RuntimeException;

/** Runs public/index.php under PHP's built-in server and calls it over real HTTP. No outside network is touched. */
final class FrontControllerTest extends DbTestCase
{
    private const PUBLIC_DIR = __DIR__ . '/../public';

    /** @var list<resource> */
    private array $processes = [];

    /** @var list<string> */
    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->processes as $process) {
            proc_terminate($process);
            proc_close($process);
        }
        foreach ($this->files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }

    private function configFile(): string
    {
        $path = sys_get_temp_dir() . '/prism-fc-config-' . bin2hex(random_bytes(3)) . '.php';
        $config = [
            'db' => Database::config(),
            'twitch' => ['client_id' => 'cid', 'client_secret' => 'SECRET-xyz-never-in-output'],
            'allowed_origins' => ['https://prism.nooroticx.tv'],
            'tt' => ['user_agent' => 'PRISM/1.0 (test)'],
            'log_path' => sys_get_temp_dir() . '/prism-fc-' . bin2hex(random_bytes(3)) . '.log',
        ];
        file_put_contents($path, '<?php return ' . var_export($config, true) . ';');
        $this->files[] = $path;
        $this->files[] = $config['log_path'];

        return $path;
    }

    /** @return string the base URL of a running server whose config is at `$configPath` */
    private function serve(string $configPath): string
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);
        $port = (int) substr($name, strrpos($name, ':') + 1);

        $process = proc_open(
            [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', self::PUBLIC_DIR, self::PUBLIC_DIR . '/index.php'],
            [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PRISM_HISTORY_CONFIG' => $configPath]),
        );
        $this->processes[] = $process;

        for ($i = 0; $i < 50; $i++) {
            $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
            if ($conn !== false) {
                fclose($conn);

                return 'http://127.0.0.1:' . $port;
            }
            usleep(100_000);
        }
        throw new RuntimeException('The front controller did not start');
    }

    public function testAnUnknownChannelOverHttpIs404TrackedFalseWithCors(): void
    {
        $base = $this->serve($this->configFile());

        $response = (new CurlHttp())->request('GET', $base . '/api/channel?login=nobody_xyz', ['Origin' => 'https://prism.nooroticx.tv']);

        $this->assertSame(404, $response->status);
        $this->assertSame(['tracked' => false], json_decode($response->body, true));
        $this->assertSame('https://prism.nooroticx.tv', $response->headers['access-control-allow-origin']);
        $this->assertStringContainsString('application/json', $response->headers['content-type']);
    }

    public function testThePreflightOverHttpIs204(): void
    {
        $base = $this->serve($this->configFile());

        $response = (new CurlHttp())->request('OPTIONS', $base . '/api/visit', [
            'Origin' => 'https://prism.nooroticx.tv',
            'Access-Control-Request-Method' => 'POST',
        ]);

        $this->assertSame(204, $response->status);
        $this->assertSame('https://prism.nooroticx.tv', $response->headers['access-control-allow-origin']);
    }

    public function testADisallowedOriginOverHttpIs403(): void
    {
        $base = $this->serve($this->configFile());

        $response = (new CurlHttp())->request('GET', $base . '/api/channel?login=nobody_xyz', ['Origin' => 'https://evil.example']);

        $this->assertSame(403, $response->status);
        $this->assertArrayNotHasKey('access-control-allow-origin', $response->headers);
    }

    public function testAMissingConfigAnswers500JsonWithoutAnyPath(): void
    {
        $base = $this->serve('/definitely/not/here/config.php');

        $response = (new CurlHttp())->request('GET', $base . '/api/channel?login=nobody_xyz');

        $this->assertSame(500, $response->status);
        $this->assertSame(['error' => 'server'], json_decode($response->body, true));
        $this->assertStringNotContainsString('not/here', $response->body);
    }

    public function testTheFrontControllerTurnsErrorDisplayOffBeforeDoingAnythingElse(): void
    {
        $code = (string) file_get_contents(self::PUBLIC_DIR . '/index.php');
        $statements = array_values(array_filter(
            array_map('trim', explode("\n", preg_replace('~//.*$~m', '', $code) ?? '')),
            static fn (string $line): bool => $line !== '' && !str_starts_with($line, '<?php') && !str_starts_with($line, 'declare('),
        ));

        $this->assertSame("ini_set('display_errors', '0');", $statements[0]);
    }

    public function testHtaccessDisablesIndexesAndRoutesEverythingToTheFrontController(): void
    {
        $htaccess = (string) file_get_contents(self::PUBLIC_DIR . '/.htaccess');

        $this->assertStringContainsString('Options -Indexes', $htaccess);
        $this->assertStringContainsString('RewriteRule ^ index.php [L]', $htaccess);
        $this->assertStringContainsString('Require all denied', $htaccess);
    }
}
