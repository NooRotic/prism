<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Api\Request;

final class RequestTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $server;

    protected function setUp(): void
    {
        $this->server = $_SERVER;
    }

    protected function tearDown(): void
    {
        $_SERVER = $this->server;
    }

    private function withAuthorization(?string $header): Request
    {
        return new Request('GET', '/api/admin/session', [], null, '', $header);
    }

    public function testBearerTokenParsing(): void
    {
        $this->assertSame('abc123', $this->withAuthorization('Bearer abc123')->bearerToken());
        $this->assertSame('abc123', $this->withAuthorization('bearer abc123')->bearerToken());
        $this->assertSame('abc123', $this->withAuthorization('BEARER abc123')->bearerToken());
        $this->assertNull($this->withAuthorization('Basic abc123')->bearerToken());
        $this->assertNull($this->withAuthorization('Bearer ')->bearerToken());
        $this->assertNull($this->withAuthorization('Bearer')->bearerToken());
        $this->assertNull($this->withAuthorization('Bearer a b')->bearerToken());
        $this->assertNull($this->withAuthorization('Bearer ' . str_repeat('a', 201))->bearerToken());
        $this->assertSame(str_repeat('a', 200), $this->withAuthorization('Bearer ' . str_repeat('a', 200))->bearerToken());
        $this->assertNull($this->withAuthorization(null)->bearerToken());
    }

    public function testFromGlobalsReadsIfNoneMatchAndAcceptEncoding(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'GET';
        $_SERVER['REQUEST_URI'] = '/api/streams';
        unset($_SERVER['HTTP_IF_NONE_MATCH'], $_SERVER['HTTP_ACCEPT_ENCODING']);
        $bare = Request::fromGlobals();
        $this->assertNull($bare->ifNoneMatch);
        $this->assertNull($bare->acceptEncoding);

        $_SERVER['HTTP_IF_NONE_MATCH'] = '"abc123"';
        $_SERVER['HTTP_ACCEPT_ENCODING'] = 'gzip, deflate';
        $r = Request::fromGlobals();
        $this->assertSame('"abc123"', $r->ifNoneMatch);
        $this->assertSame('gzip, deflate', $r->acceptEncoding);
    }

    public function testFromGlobalsReadsTheThreeSourcesInOrder(): void
    {
        foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'HTTP_X_PRISM_AUTHORIZATION'] as $key) {
            unset($_SERVER[$key]);
        }
        $_SERVER['REQUEST_METHOD'] = 'GET';
        $_SERVER['REQUEST_URI'] = '/api/admin/session';
        $this->assertNull(Request::fromGlobals()->authorization);

        $_SERVER['HTTP_X_PRISM_AUTHORIZATION'] = 'Bearer custom';
        $this->assertSame('Bearer custom', Request::fromGlobals()->authorization);

        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = 'Bearer redirected';
        $this->assertSame('Bearer redirected', Request::fromGlobals()->authorization);

        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer plain';
        $this->assertSame('Bearer plain', Request::fromGlobals()->authorization);
        $this->assertSame('plain', Request::fromGlobals()->bearerToken());
    }
}
