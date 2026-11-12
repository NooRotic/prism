<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Http\CurlHttp;
use RuntimeException;

/** Talks to a throwaway PHP built-in server, so the real curl code is exercised without the internet. */
final class CurlHttpTest extends TestCase
{
    /** @var resource|null */
    private static $process = null;
    private static int $port = 0;

    public static function setUpBeforeClass(): void
    {
        self::$port = self::freePort();
        self::$process = proc_open(
            [PHP_BINARY, '-S', '127.0.0.1:' . self::$port, __DIR__ . '/fixtures/http/router.php'],
            [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '4']),
        );
        for ($i = 0; $i < 50; $i++) {
            $socket = @fsockopen('127.0.0.1', self::$port, $errno, $errstr, 0.1);
            if ($socket !== false) {
                fclose($socket);

                return;
            }
            usleep(100_000);
        }
        throw new RuntimeException('The test HTTP server did not start');
    }

    public static function tearDownAfterClass(): void
    {
        if (is_resource(self::$process)) {
            proc_terminate(self::$process);
            proc_close(self::$process);
        }
    }

    private static function freePort(): int
    {
        $server = stream_socket_server('tcp://127.0.0.1:0');
        $name = (string) stream_socket_get_name($server, false);
        fclose($server);

        return (int) substr($name, strrpos($name, ':') + 1);
    }

    private function url(string $path): string
    {
        return 'http://127.0.0.1:' . self::$port . $path;
    }

    public function testReturnsStatusBodyAndLowercasedHeaders(): void
    {
        $response = (new CurlHttp())->request('GET', $this->url('/ok'), ['User-Agent' => 'TestAgent/1']);

        $this->assertSame(200, $response->status);
        $this->assertSame('TestAgent/1', json_decode($response->body, true)['ua']);
        $this->assertSame('Hello', $response->headers['x-custom']);
        $this->assertStringContainsString('application/json', $response->headers['content-type']);
    }

    public function testPostSendsTheBody(): void
    {
        $response = (new CurlHttp())->request('POST', $this->url('/ok'), ['Content-Type' => 'application/x-www-form-urlencoded'], 'grant_type=x');

        $decoded = json_decode($response->body, true);
        $this->assertSame('POST', $decoded['method']);
        $this->assertSame('grant_type=x', $decoded['body']);
    }

    public function test429CarriesRetryAfter(): void
    {
        $response = (new CurlHttp())->request('GET', $this->url('/limited'));

        $this->assertSame(429, $response->status);
        $this->assertSame('120', $response->headers['retry-after']);
    }

    public function testANon2xxBodyIsKept(): void
    {
        $response = (new CurlHttp())->request('GET', $this->url('/error'));

        $this->assertSame(500, $response->status);
        $this->assertSame('boom', $response->body);
    }

    public function testRedirectsAreNotFollowed(): void
    {
        $response = (new CurlHttp())->request('GET', $this->url('/redirect'));

        $this->assertSame(302, $response->status);
        $this->assertSame('/ok', $response->headers['location']);
    }

    public function testTimeoutReturnsStatusZero(): void
    {
        $response = (new CurlHttp())->request('GET', $this->url('/slow'), [], null, 1);

        $this->assertSame(0, $response->status);
        $this->assertSame('', $response->body);
    }

    public function testConnectionRefusedReturnsStatusZero(): void
    {
        $response = (new CurlHttp())->request('GET', 'http://127.0.0.1:' . self::freePort() . '/ok', [], null, 2);

        $this->assertSame(0, $response->status);
    }
}
