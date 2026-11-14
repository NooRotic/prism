<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Http\CurlHttp;
use Prism\History\Tests\Support\BuiltInServer;

/** How much of a request body the front controller's Request reads: enough for the longest admin form, no more. */
final class RequestBodyTest extends TestCase
{
    private ?BuiltInServer $server = null;

    protected function tearDown(): void
    {
        $this->server?->stop();
    }

    private function bytesRead(int $sent): string
    {
        $this->server ??= BuiltInServer::start(__DIR__ . '/fixtures/http', __DIR__ . '/fixtures/http/body-length.php');

        return (new CurlHttp())->request('POST', $this->server->url('/x'), [], str_repeat('x', $sent))->body;
    }

    public function testABodyUpToFourKilobytesIsReadWhole(): void
    {
        $this->assertSame('100', $this->bytesRead(100));
        $this->assertSame('1025', $this->bytesRead(1025), 'it used to stop here, which cut off a long stream address');
        $this->assertSame('4096', $this->bytesRead(4096));
    }

    public function testNothingPastOneByteBeyondTheLimitIsRead(): void
    {
        $this->assertSame('4097', $this->bytesRead(4097));
        $this->assertSame('4097', $this->bytesRead(100_000), 'one byte over the largest limit is enough to know it is too large');
    }
}
