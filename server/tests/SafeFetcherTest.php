<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Net\PinnedResponse;
use Prism\History\Net\SafeFetcher;
use Prism\History\Tests\Support\FakeResolver;
use Prism\History\Tests\Support\FakeTransport;
use RuntimeException;

final class SafeFetcherTest extends TestCase
{
    private const ERRORS = ['blocked', 'port', 'scheme', 'dns', 'redirects', 'too_large', 'network'];

    private FakeTransport $transport;

    protected function setUp(): void
    {
        $this->transport = new FakeTransport();
    }

    /** @param array<string,list<string>|\Throwable> $dns */
    private function fetcher(array $dns = []): SafeFetcher
    {
        $dns += [
            'logo.test' => ['93.184.216.34'],
            'cdn.test' => ['93.184.216.35'],
            'internal.test' => ['192.168.1.5'],
            'mixed.test' => ['93.184.216.34', '10.0.0.5'],
        ];

        return new SafeFetcher(new FakeResolver($dns), $this->transport, 'PRISM-test/1 (+https://example.invalid)');
    }

    public function testFetchesAPublicAddressThroughThePinnedIp(): void
    {
        $this->transport->push(FakeTransport::ok('hello', ['content-type' => 'image/png']));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 1000);

        $this->assertNull($r->error);
        $this->assertSame(200, $r->status);
        $this->assertSame('hello', $r->body);
        $this->assertSame('image/png', $r->headers['content-type']);
        $this->assertSame('https://logo.test/a.png', $r->finalUrl);
        $this->assertCount(1, $this->transport->calls);
        $call = $this->transport->calls[0];
        $this->assertSame(['https://logo.test/a.png', '93.184.216.34', 443, 1000, 8, 'PRISM-test/1 (+https://example.invalid)'], [$call['url'], $call['ip'], $call['port'], $call['maxBytes'], $call['timeoutSec'], $call['userAgent']]);
    }

    public function testPortsAreTheSchemesDefaultsWhenNoneIsGiven(): void
    {
        $this->transport->push(FakeTransport::ok(), FakeTransport::ok(), FakeTransport::ok());

        $this->fetcher()->fetch('http://logo.test/a.png', 10);
        $this->fetcher()->fetch('http://logo.test:80/a.png', 10);
        $this->fetcher()->fetch('https://logo.test:443/a.png', 10);

        $this->assertSame([80, 80, 443], array_column($this->transport->calls, 'port'));
    }

    public function testAnyPrivateAnswerBlocksTheName(): void
    {
        $r = $this->fetcher()->fetch('https://mixed.test/a.png', 1000);

        $this->assertSame('blocked', $r->error);
        $this->assertSame([], $this->transport->calls, 'nothing was requested');
        $this->assertSame('', $r->body);
    }

    public function testRedirectToAPrivateAddressIsBlocked(): void
    {
        $this->transport->push(FakeTransport::redirect('http://internal.test/secret', 302, 'REDIRECT-BODY'));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 1000);

        $this->assertSame('blocked', $r->error);
        $this->assertCount(1, $this->transport->calls, 'the private target was never contacted');
        $this->assertSame('', $r->body, 'what the first response carried is not handed back');
    }

    public function testRedirectToALiteralMetadataAddressIsBlocked(): void
    {
        $this->transport->push(FakeTransport::redirect('http://169.254.169.254/latest/meta-data/'));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 1000);

        $this->assertSame('blocked', $r->error);
        $this->assertCount(1, $this->transport->calls);
    }

    public function testRedirectToAnotherPortIsBlocked(): void
    {
        $this->transport->push(FakeTransport::redirect('https://cdn.test:8443/x.png'));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 1000);

        $this->assertSame('port', $r->error);
        $this->assertCount(1, $this->transport->calls);
    }

    public function testRedirectToAnotherSchemeIsRefused(): void
    {
        foreach (['file:///etc/passwd', 'ftp://cdn.test/x.png', 'gopher://cdn.test/x'] as $location) {
            $transport = new FakeTransport();
            $transport->push(FakeTransport::redirect($location));
            $fetcher = new SafeFetcher(new FakeResolver(['logo.test' => ['93.184.216.34'], 'cdn.test' => ['93.184.216.35']]), $transport, 'UA');

            $this->assertSame('scheme', $fetcher->fetch('https://logo.test/a.png', 1000)->error, $location);
            $this->assertCount(1, $transport->calls, $location);
        }
    }

    public function testARedirectIsFollowedAndEveryHopIsVettedAgain(): void
    {
        $this->transport->push(FakeTransport::redirect('https://cdn.test/final.png'), FakeTransport::ok('image'));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 1000);

        $this->assertNull($r->error);
        $this->assertSame('image', $r->body);
        $this->assertSame('https://cdn.test/final.png', $r->finalUrl);
        $this->assertSame(['93.184.216.34', '93.184.216.35'], array_column($this->transport->calls, 'ip'), 'each hop goes to the address vetted for that hop');
    }

    public function testThreeRedirectsAreFollowedButMoreThanThreeStop(): void
    {
        $hop = static fn (int $n): PinnedResponse => FakeTransport::redirect('https://logo.test/hop' . $n);

        $ok = new FakeTransport();
        $ok->push($hop(1), $hop(2), $hop(3), FakeTransport::ok('done'));
        $r = (new SafeFetcher(new FakeResolver(['logo.test' => ['93.184.216.34']]), $ok, 'UA'))->fetch('https://logo.test/start', 100);
        $this->assertNull($r->error);
        $this->assertSame('done', $r->body);

        $loop = new FakeTransport();
        $loop->push($hop(1), $hop(2), $hop(3), $hop(4), FakeTransport::ok('never reached'));
        $r = (new SafeFetcher(new FakeResolver(['logo.test' => ['93.184.216.34']]), $loop, 'UA'))->fetch('https://logo.test/start', 100);
        $this->assertSame('redirects', $r->error);
        $this->assertCount(4, $loop->calls);
        $this->assertSame('', $r->body);
    }

    public function testARedirectWithoutALocationIsReturnedAsItIs(): void
    {
        $this->transport->push(new PinnedResponse(304, [], '', false));

        $r = $this->fetcher()->fetch('https://logo.test/a.png', 100);

        $this->assertNull($r->error);
        $this->assertSame(304, $r->status);
    }

    public function testNonHttpSchemesAndUserinfoAreRefused(): void
    {
        $cases = [
            'ftp://logo.test/a.png' => 'scheme',
            'file:///etc/passwd' => 'scheme',
            'gopher://logo.test/' => 'scheme',
            'javascript:alert(1)' => 'scheme',
            'logo.test/a.png' => 'scheme',
            '' => 'scheme',
            'https://user:pw@logo.test/a.png' => 'blocked',
            'https://user@logo.test/a.png' => 'blocked',
        ];
        foreach ($cases as $url => $error) {
            $this->assertSame($error, $this->fetcher()->fetch((string) $url, 100)->error, (string) $url);
        }
        $this->assertSame([], $this->transport->calls);
    }

    public function testPortsOtherThan80And443AreRefused(): void
    {
        foreach (['https://logo.test:8443/a.png', 'http://logo.test:8080/a.png', 'http://logo.test:22/', 'https://logo.test:80000/a.png', 'https://logo.test:0/a.png'] as $url) {
            $error = $this->fetcher()->fetch($url, 100)->error;
            $this->assertContains($error, ['port', 'scheme'], $url);
        }
        $this->assertSame('port', $this->fetcher()->fetch('https://logo.test:8443/a.png', 100)->error);
        $this->assertSame([], $this->transport->calls);
    }

    public function testBodyIsCutAtTheLimitAndReportedTooLarge(): void
    {
        $this->transport->push(new PinnedResponse(200, [], str_repeat('x', 50), true));

        $r = $this->fetcher()->fetch('https://logo.test/big.png', 50);

        $this->assertSame('too_large', $r->error);
        $this->assertLessThanOrEqual(50, strlen($r->body));
    }

    public function testATransportThatReturnsMoreThanTheLimitIsCutAgain(): void
    {
        $this->transport->push(new PinnedResponse(200, [], str_repeat('x', 500), false));

        $r = $this->fetcher()->fetch('https://logo.test/big.png', 100);

        $this->assertSame('too_large', $r->error);
        $this->assertLessThanOrEqual(100, strlen($r->body));
    }

    public function testAResolverFailureIsDnsNotAnException(): void
    {
        $this->assertSame('dns', $this->fetcher(['broken.test' => new RuntimeException('resolver exploded: SECRET')])->fetch('https://broken.test/a.png', 100)->error);
        $this->assertSame('dns', $this->fetcher()->fetch('https://nonexistent.test/a.png', 100)->error, 'no answer at all');
        $this->assertSame([], $this->transport->calls);
    }

    public function testATransportFailureIsNetworkNotAnException(): void
    {
        $this->transport->push(new RuntimeException('connect failed to 93.184.216.34 SECRET'), new PinnedResponse(0, [], '', false));

        $first = $this->fetcher()->fetch('https://logo.test/a.png', 100);
        $second = $this->fetcher()->fetch('https://logo.test/a.png', 100);

        $this->assertSame(['network', 'network'], [$first->error, $second->error]);
    }

    public function testTheErrorNeverContainsTheBodyOrTheFailureText(): void
    {
        $this->transport->push(
            FakeTransport::redirect('http://internal.test/x', 302, 'SECRET-BODY'),
            new PinnedResponse(200, [], 'SECRET-BODY', true),
            new RuntimeException('SECRET-BODY'),
        );
        $results = [
            $this->fetcher()->fetch('https://logo.test/1', 11),
            $this->fetcher()->fetch('https://logo.test/2', 11),
            $this->fetcher()->fetch('https://logo.test/3', 11),
            $this->fetcher(['broken.test' => new RuntimeException('SECRET-BODY')])->fetch('https://broken.test/4', 11),
        ];

        foreach ($results as $r) {
            $this->assertContains($r->error, self::ERRORS);
            $this->assertStringNotContainsString('SECRET', (string) $r->error);
        }
        $this->assertSame('', $results[0]->body);
    }

    public function testLiteralIpAddressesAreVettedToo(): void
    {
        foreach (['http://127.0.0.1/x', 'http://[::1]/x', 'http://10.1.2.3/x', 'http://169.254.169.254/x', 'http://[::ffff:127.0.0.1]/x', 'http://[fe80::1]/x'] as $url) {
            $this->assertSame('blocked', $this->fetcher()->fetch($url, 100)->error, $url);
        }
        // Spellings of an address that curl would read as 127.0.0.1 are not names either.
        foreach (['http://2130706433/x', 'http://0x7f.0.0.1/x', 'http://0177.0.0.1/x', 'http://127.1/x'] as $url) {
            $this->assertSame('blocked', $this->fetcher()->fetch($url, 100)->error, $url);
        }
        $this->assertSame([], $this->transport->calls);

        $this->transport->push(FakeTransport::ok('hi'));
        $resolver = new FakeResolver();
        $r = (new SafeFetcher($resolver, $this->transport, 'UA'))->fetch('https://8.8.8.8/x', 100);
        $this->assertNull($r->error);
        $this->assertSame([], $resolver->calls, 'a literal address is not looked up');
        $this->assertSame('8.8.8.8', $this->transport->calls[0]['ip']);
    }

    public function testAHostThatIsNotAPlainNameIsRefused(): void
    {
        foreach (['https://exa mple.test/', "https://logo.test\x00.evil/", 'https://-bad.test/', 'https://日本語.test/'] as $url) {
            $error = $this->fetcher()->fetch($url, 100)->error;
            $this->assertContains($error, ['dns', 'scheme', 'blocked'], $url);
        }
        $this->assertSame([], $this->transport->calls);
    }

    /** @return array<string,array{0:string,1:string,2:?string}> */
    public static function locations(): array
    {
        $base = 'https://logo.test/a/b/c.png?old=1#frag';

        return [
            'absolute' => [$base, 'https://other.test/g.png', 'https://other.test/g.png'],
            'absolute path' => [$base, '/x.png', 'https://logo.test/x.png'],
            'relative' => [$base, 'd.png', 'https://logo.test/a/b/d.png'],
            'parent' => [$base, '../e.png', 'https://logo.test/a/e.png'],
            'past the root' => [$base, '../../../../e.png', 'https://logo.test/e.png'],
            'protocol relative' => [$base, '//cdn.test/f.png', 'https://cdn.test/f.png'],
            'query only' => [$base, '?q=2', 'https://logo.test/a/b/c.png?q=2'],
            'dot segments' => [$base, './x/../y.png', 'https://logo.test/a/b/y.png'],
            'http stays http' => ['http://logo.test/a', '/b', 'http://logo.test/b'],
            'a port is kept' => ['https://logo.test:8443/a', '/b', 'https://logo.test:8443/b'],
            'control characters' => [$base, "/x\r\nSet-Cookie: a=b", null],
            'empty' => [$base, '', null],
            'a space' => [$base, '/a b', null],
        ];
    }

    #[DataProvider('locations')]
    public function testRelativeRedirectsAreResolvedAgainstTheCurrentUrl(string $base, string $location, ?string $expected): void
    {
        $this->assertSame($expected, SafeFetcher::resolveLocation($base, $location));
    }
}
