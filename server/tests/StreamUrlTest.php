<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Playlist\Countries;
use Prism\History\Playlist\StreamUrl;

final class StreamUrlTest extends TestCase
{
    /** @return array<string,array{0:string,1:?string}> */
    public static function normaliseRows(): array
    {
        return [
            'upper-case scheme and host' => ['HTTPS://Example.COM/Live/Stream.m3u8', 'https://example.com/Live/Stream.m3u8'],
            'default https port dropped' => ['https://example.com:443/a.m3u8', 'https://example.com/a.m3u8'],
            'default http port dropped' => ['http://example.com:80/a.m3u8', 'http://example.com/a.m3u8'],
            'other port kept' => ['https://example.com:8080/a.m3u8', 'https://example.com:8080/a.m3u8'],
            'a port that is only default for the other scheme is kept' => ['http://example.com:443/a.m3u8', 'http://example.com:443/a.m3u8'],
            'fragment dropped' => ['https://example.com/a.m3u8#t=10', 'https://example.com/a.m3u8'],
            'query kept as written' => ['https://example.com/a.m3u8?Quality=HD&b=2', 'https://example.com/a.m3u8?Quality=HD&b=2'],
            'an empty query mark is dropped' => ['https://example.com/a.m3u8?', 'https://example.com/a.m3u8'],
            'path case kept' => ['https://example.com/AbC/dEf.M3U8', 'https://example.com/AbC/dEf.M3U8'],
            'whitespace trimmed' => ["  https://example.com/a.m3u8 \r\n", 'https://example.com/a.m3u8'],
            'no path becomes a slash' => ['https://Example.com', 'https://example.com/'],
            'an ipv6 host keeps its brackets' => ['http://[2001:DB8::1]:80/x', 'http://[2001:db8::1]/x'],
            'ftp refused' => ['ftp://example.com/a', null],
            'javascript refused' => ['javascript:alert(1)', null],
            'rtmp refused' => ['rtmp://example.com/live', null],
            'no scheme refused' => ['example.com/a.m3u8', null],
            'no host refused' => ['https:///a.m3u8', null],
            'empty refused' => ['', null],
            'a login refused' => ['https://user:pass@example.com/a.m3u8', null],
            'a user name alone refused' => ['https://user@example.com/a.m3u8', null],
            'an empty login refused' => ['https://@example.com/a.m3u8', null],
            'a space inside refused' => ['https://example.com/a b.m3u8', null],
            'a control character inside refused' => ["https://example.com/a\x00b.m3u8", null],
        ];
    }

    #[DataProvider('normaliseRows')]
    public function testNormaliseTable(string $input, ?string $expected): void
    {
        $this->assertSame($expected, StreamUrl::normalise($input));
    }

    public function testTheSameStreamWrittenTwoWaysHasTheSameId(): void
    {
        $a = StreamUrl::normalise('HTTPS://Example.COM:443/live/a.m3u8#now');
        $b = StreamUrl::normalise('https://example.com/live/a.m3u8');

        $this->assertNotNull($a);
        $this->assertNotNull($b);
        $this->assertSame(StreamUrl::id($a), StreamUrl::id($b));
        $this->assertNotSame(
            StreamUrl::id($b),
            StreamUrl::id((string) StreamUrl::normalise('https://example.com/live/A.m3u8')),
            'the path is case-sensitive',
        );
    }

    public function testIdIs64HexAndPublicIdItsFirst12(): void
    {
        $id = StreamUrl::id('https://example.com/a.m3u8');

        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $id);
        $this->assertSame(hash('sha256', 'https://example.com/a.m3u8'), $id);
        $this->assertSame(substr($id, 0, 12), StreamUrl::publicId($id));
        $this->assertSame(12, strlen(StreamUrl::publicId($id)));
    }

    /** @return array<string,array{0:?string,1:?string}> */
    public static function flagRows(): array
    {
        return [
            'lower-case' => ['us', 'us'],
            'upper-case' => ['US', 'us'],
            'uk becomes gb' => ['uk', 'gb'],
            'UK becomes gb' => ['UK', 'gb'],
            'three letters' => ['xyz', null],
            'one letter' => ['u', null],
            'digits' => ['u1', null],
            'empty' => ['', null],
            'null' => [null, null],
        ];
    }

    #[DataProvider('flagRows')]
    public function testFlagCodes(?string $suffix, ?string $expected): void
    {
        $this->assertSame($expected, Countries::flagCode($suffix));
    }
}
