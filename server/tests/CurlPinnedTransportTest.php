<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Net\CurlPinnedTransport;
use RuntimeException;

/** The real curl transport against a throwaway PHP built-in server: pinning, no redirects, a size cap, hard timeouts. */
final class CurlPinnedTransportTest extends TestCase
{
    /** @var resource|null */
    private static $process = null;
    private static int $port = 0;

    public static function setUpBeforeClass(): void
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);
        self::$port = (int) substr($name, strrpos($name, ':') + 1);
        self::$process = proc_open(
            [PHP_BINARY, '-S', '127.0.0.1:' . self::$port, __DIR__ . '/fixtures/http/pinned.php'],
            [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '4']),
        );
        for ($i = 0; $i < 50; $i++) {
            $conn = @fsockopen('127.0.0.1', self::$port, $errno, $errstr, 0.1);
            if ($conn !== false) {
                fclose($conn);

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

    /** A name that resolves nowhere: only the pin can make a request reach the server. */
    private function url(string $path): string
    {
        return 'http://pinned.invalid:' . self::$port . $path;
    }

    public function testTheRequestGoesToThePinnedAddressWhateverTheNameSays(): void
    {
        $r = (new CurlPinnedTransport())->get($this->url('/echo'), '127.0.0.1', self::$port, 10_000, 5, 'PRISM-test/1');

        $this->assertSame(200, $r->status);
        $decoded = json_decode($r->body, true);
        $this->assertSame('pinned.invalid:' . self::$port, $decoded['host'], 'the Host header still names the original host');
        $this->assertSame('PRISM-test/1', $decoded['ua']);
        $this->assertSame('GET', $decoded['method']);
        $this->assertFalse($r->truncated);
    }

    public function testHeadersAreLowerCased(): void
    {
        $r = (new CurlPinnedTransport())->get($this->url('/echo'), '127.0.0.1', self::$port, 10_000, 5);

        $this->assertSame('Hello', $r->headers['x-custom']);
        $this->assertStringContainsString('application/json', $r->headers['content-type']);
    }

    public function testRedirectsAreNotFollowed(): void
    {
        $r = (new CurlPinnedTransport())->get($this->url('/redirect'), '127.0.0.1', self::$port, 10_000, 5);

        $this->assertSame(302, $r->status);
        $this->assertSame('/echo', $r->headers['location']);
    }

    public function testTheBodyStopsAtTheLimitAndSaysSo(): void
    {
        $r = (new CurlPinnedTransport())->get($this->url('/big'), '127.0.0.1', self::$port, 1000, 5);

        $this->assertTrue($r->truncated);
        $this->assertLessThanOrEqual(1000, strlen($r->body));
    }

    public function testABodyUnderTheLimitIsWholeAndNotTruncated(): void
    {
        $r = (new CurlPinnedTransport())->get($this->url('/big'), '127.0.0.1', self::$port, 300_000, 5);

        $this->assertFalse($r->truncated);
        $this->assertSame(200_000, strlen($r->body));
    }

    public function testATimeoutAndAConnectionRefusedGiveStatusZero(): void
    {
        $slow = (new CurlPinnedTransport())->get($this->url('/slow'), '127.0.0.1', self::$port, 1000, 1);
        $this->assertSame(0, $slow->status);
        $this->assertSame('', $slow->body);

        $refused = (new CurlPinnedTransport())->get('http://pinned.invalid:1/x', '127.0.0.1', 1, 1000, 2);
        $this->assertSame(0, $refused->status);
    }

    public function testOnlyHttpAndHttpsAreSpoken(): void
    {
        $r = (new CurlPinnedTransport())->get('file:///etc/hostname', '127.0.0.1', 80, 1000, 2);

        $this->assertSame(0, $r->status);
        $this->assertSame('', $r->body);
    }
}
