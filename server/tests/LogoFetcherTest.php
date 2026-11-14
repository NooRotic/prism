<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use Prism\History\Net\PinnedResponse;
use Prism\History\Net\SafeFetcher;
use Prism\History\Playlist\LogoFetcher;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeResolver;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\FakeTransport;
use RuntimeException;

final class LogoFetcherTest extends DbTestCase
{
    private const PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR";
    private const JPG = "\xFF\xD8\xFF\xE0\x00\x10JFIF";
    private const GIF = 'GIF89a' . "\x01\x00\x01\x00";
    private const WEBP = "RIFF\x24\x00\x00\x00WEBPVP8 ";

    private StreamStore $store;
    private FakeTransport $transport;
    private FakeSleeper $sleeper;
    private string $root;
    private string $logoDir;
    private string $dataDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->transport = new FakeTransport();
        $this->sleeper = new FakeSleeper($this->clock);
        $this->root = sys_get_temp_dir() . '/prism-logos-' . bin2hex(random_bytes(6));
        $this->logoDir = $this->root . '/logos';
        $this->dataDir = $this->root . '/data';
    }

    protected function tearDown(): void
    {
        foreach ([$this->logoDir, $this->dataDir] as $dir) {
            foreach (glob($dir . '/{,.}*', GLOB_BRACE) ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            if (is_dir($dir)) {
                rmdir($dir);
            }
        }
        if (is_file($this->root)) {
            unlink($this->root);
        } elseif (is_dir($this->root)) {
            rmdir($this->root);
        }
    }

    private function fetcher(?string $logoDir = null): LogoFetcher
    {
        $resolver = new FakeResolver([
            'logos.test' => ['93.184.216.34'],
            'other.test' => ['93.184.216.35'],
            'evil.test' => ['10.0.0.5'],
        ]);

        return new LogoFetcher(
            new SafeFetcher($resolver, $this->transport, 'PRISM-test/1'),
            $this->store,
            new SnapshotWriter($this->store, $this->clock, $this->dataDir),
            $this->sleeper,
            $this->clock,
            $logoDir ?? $this->logoDir,
        );
    }

    /** @param array<string,mixed> $extra */
    private function stream(string $n, string $logoUrl, array $extra = []): string
    {
        $url = 'https://stream' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        // added_at orders the fetch queue, so the streams are fetched in the order the test made them.
        $this->store->insertIfNew(array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'Stream ' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test', 'logo_url' => $logoUrl,
            'added_at' => '2026-11-12 03:00:' . str_pad($n, 2, '0', STR_PAD_LEFT),
        ], $extra));

        return StreamUrl::publicId($id);
    }

    /** @return array<string,mixed> */
    private function row(string $publicId): array
    {
        $row = $this->store->findByPublicId($publicId);
        $this->assertNotNull($row);

        return $row;
    }

    /** @return array<string,array{0:string,1:?string}> */
    public static function sniffRows(): array
    {
        return [
            'png' => [self::PNG, 'png'],
            'jpeg' => [self::JPG, 'jpg'],
            'gif 89a' => ['GIF89a' . "\x00\x00", 'gif'],
            'gif 87a' => ['GIF87a' . "\x00\x00", 'gif'],
            'webp' => [self::WEBP, 'webp'],
            'svg' => ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', null],
            'svg with an xml header' => ['<?xml version="1.0"?><svg></svg>', null],
            'html' => ['<!doctype html><html><body>404</body></html>', null],
            'empty' => ['', null],
            'a truncated png header' => ["\x89PNG", null],
            'a png header cut short' => ["\x89PNG\r\n\x1a", null],
            'riff that is not webp' => ["RIFF\x24\x00\x00\x00WAVEfmt ", null],
            'riff alone' => ['RIFF', null],
            'a gif header cut short' => ['GIF89', null],
            'jpeg marker cut short' => ["\xFF\xD8", null],
            'a png after leading junk' => ["  \n" . self::PNG, null],
            'plain text' => ['hello', null],
        ];
    }

    #[DataProvider('sniffRows')]
    public function testSniffTable(string $bytes, ?string $expected): void
    {
        $this->assertSame($expected, LogoFetcher::sniff($bytes));
    }

    public function testAnSvgNamedPngIsRejected(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(FakeTransport::ok('<svg xmlns="http://www.w3.org/2000/svg"></svg>', ['content-type' => 'image/png']));

        $result = $this->fetcher()->run(10);

        $this->assertSame(['fetched' => 0, 'failed' => 1], $result);
        $row = $this->row($publicId);
        $this->assertNull($row['logo_file']);
        $this->assertSame(1, $row['logo_tries']);
        $this->assertSame([], glob($this->logoDir . '/*') ?: []);
    }

    public function testAHtmlErrorPageWithAnImageContentTypeIsRejected(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(FakeTransport::ok('<html><body>Not Found</body></html>', ['content-type' => 'image/png']));

        $this->assertSame(['fetched' => 0, 'failed' => 1], $this->fetcher()->run(10));
        $this->assertNull($this->row($publicId)['logo_file']);
    }

    public function testAnErrorStatusWithAnImageBodyIsRejected(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(new PinnedResponse(404, [], self::PNG, false));

        $this->assertSame(['fetched' => 0, 'failed' => 1], $this->fetcher()->run(10));
        $this->assertNull($this->row($publicId)['logo_file']);
    }

    public function testOversizeLogosAreRejected(): void
    {
        $this->stream('1', 'https://logos.test/a.png');
        $this->stream('2', 'https://logos.test/b.png');
        $this->transport->push(
            new PinnedResponse(200, [], substr(self::PNG . str_repeat('x', 300_000), 0, 262_144), true),
            new PinnedResponse(200, [], self::PNG . str_repeat('x', 262_144), false),
        );

        $this->assertSame(['fetched' => 0, 'failed' => 2], $this->fetcher()->run(10));
        $this->assertSame(262_144, $this->transport->calls[0]['maxBytes'], 'the limit is passed to the fetch');
        $this->assertSame([], glob($this->logoDir . '/*') ?: []);
    }

    public function testAcceptedLogoIsWrittenAndRecordedWithTheRightExtension(): void
    {
        $png = $this->stream('1', 'https://logos.test/a.jpg'); // the address says jpg, the bytes say png: the bytes win
        $jpg = $this->stream('2', 'https://logos.test/b.png');
        $gif = $this->stream('3', 'https://logos.test/c');
        $webp = $this->stream('4', 'https://logos.test/d.gif');
        $this->transport->push(FakeTransport::ok(self::PNG . 'A'), FakeTransport::ok(self::JPG . 'B'), FakeTransport::ok(self::GIF . 'C'), FakeTransport::ok(self::WEBP . 'D'));

        $this->assertSame(['fetched' => 4, 'failed' => 0], $this->fetcher()->run(10));

        foreach ([[$png, 'png', self::PNG . 'A'], [$jpg, 'jpg', self::JPG . 'B'], [$gif, 'gif', self::GIF . 'C'], [$webp, 'webp', self::WEBP . 'D']] as [$publicId, $ext, $bytes]) {
            $this->assertSame($publicId . '.' . $ext, $this->row($publicId)['logo_file']);
            $this->assertSame($bytes, file_get_contents($this->logoDir . '/' . $publicId . '.' . $ext));
        }
        $this->assertSame(4, count(glob($this->logoDir . '/*') ?: []), 'no temporary file is left behind');
        $this->assertSame([], $this->store->withLogoToFetch(10));
    }

    public function testAFailureAddsOneTryAndStopsAfterThree(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(new PinnedResponse(404, [], 'no', false), new PinnedResponse(404, [], 'no', false), new PinnedResponse(500, [], 'no', false));

        $this->assertSame(['fetched' => 0, 'failed' => 1], $this->fetcher()->run(10));
        $this->assertSame(1, $this->row($publicId)['logo_tries']);
        $this->fetcher()->run(10);
        $this->fetcher()->run(10);
        $this->assertSame(3, $this->row($publicId)['logo_tries']);
        $callsAfterThree = count($this->transport->calls);

        $this->assertSame(['fetched' => 0, 'failed' => 0], $this->fetcher()->run(10), 'a stream that failed three times is left alone');
        $this->assertCount($callsAfterThree, $this->transport->calls);
    }

    public function testSameHostRequestsAreOneSecondApart(): void
    {
        $this->stream('1', 'https://logos.test/a.png');
        $this->stream('2', 'https://logos.test/b.png');
        $this->stream('3', 'https://other.test/c.png');
        $this->stream('4', 'https://logos.test/d.png');
        $this->transport->push(...array_fill(0, 4, FakeTransport::ok(self::PNG)));

        $this->fetcher()->run(10);

        // Requests in order of the queue (added_at ties by id), so count by host rather than by position.
        $this->assertSame(4, count($this->transport->calls));
        $this->assertSame(2000, $this->sleeper->totalMs, 'three logos.test requests: two one-second gaps; other.test needs none');
        $this->assertSame([1000, 1000], $this->sleeper->calls);
    }

    public function testOnlyTheRemainingPartOfTheGapIsSlept(): void
    {
        $this->stream('1', 'https://logos.test/a.png');
        $this->stream('2', 'https://logos.test/b.png');
        $this->transport->push(FakeTransport::ok(self::PNG), FakeTransport::ok(self::PNG));
        $this->sleeper->onSleep = null;

        // The first request itself takes 400 ms of (fake) time.
        $clock = $this->clock;
        $slow = new class ($clock, $this->transport) implements \Prism\History\Net\PinnedTransport {
            public function __construct(private \Prism\History\Tests\Support\FakeClock $clock, private FakeTransport $inner)
            {
            }

            public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = ''): PinnedResponse
            {
                $this->clock->advanceMs(400);

                return $this->inner->get($url, $ip, $port, $maxBytes, $timeoutSec, $userAgent);
            }
        };
        $fetcher = new LogoFetcher(
            new SafeFetcher(new FakeResolver(['logos.test' => ['93.184.216.34']]), $slow, 'UA'),
            $this->store,
            new SnapshotWriter($this->store, $this->clock, $this->dataDir),
            $this->sleeper,
            $this->clock,
            $this->logoDir,
        );

        $fetcher->run(10);

        $this->assertSame([600], $this->sleeper->calls);
    }

    public function testPrivateLogoHostsAreNeverFetched(): void
    {
        $publicId = $this->stream('1', 'https://evil.test/a.png');

        $result = $this->fetcher()->run(10);

        $this->assertSame(['fetched' => 0, 'failed' => 1], $result);
        $this->assertSame([], $this->transport->calls, 'nothing was requested from a name that points inside');
        $this->assertSame(1, $this->row($publicId)['logo_tries']);
    }

    public function testALogoThatRedirectsInsideIsNeverFetched(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(FakeTransport::redirect('http://169.254.169.254/latest/meta-data/'));

        $this->assertSame(['fetched' => 0, 'failed' => 1], $this->fetcher()->run(10));
        $this->assertCount(1, $this->transport->calls);
        $this->assertNull($this->row($publicId)['logo_file']);
    }

    public function testTheSnapshotIsRewrittenOnlyWhenSomethingChanged(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(new PinnedResponse(404, [], '', false));

        $this->fetcher()->run(10);
        $this->assertFileDoesNotExist($this->dataDir . '/streams.json', 'a run with only failures changes nothing visitors see');

        $this->transport->push(FakeTransport::ok(self::PNG));
        $this->fetcher()->run(10);

        $this->assertFileExists($this->dataDir . '/streams.json');
        $snapshot = json_decode((string) file_get_contents($this->dataDir . '/streams.json'), true);
        $this->assertSame($publicId . '.png', $snapshot['streams'][0]['l']);

        $stamp = filemtime($this->dataDir . '/streams.json');
        $before = (string) file_get_contents($this->dataDir . '/streams.json');
        $this->clock->advanceMs(60_000);
        $this->fetcher()->run(10); // nothing left to fetch
        $this->assertSame($before, (string) file_get_contents($this->dataDir . '/streams.json'));
        $this->assertSame($stamp, filemtime($this->dataDir . '/streams.json'));
    }

    public function testRunHonoursTheLimit(): void
    {
        foreach (['1', '2', '3', '4', '5'] as $n) {
            $this->stream($n, 'https://logos.test/' . $n . '.png');
        }
        $this->transport->push(...array_fill(0, 5, FakeTransport::ok(self::PNG)));

        $this->assertSame(['fetched' => 2, 'failed' => 0], $this->fetcher()->run(2));
        $this->assertCount(2, $this->transport->calls);
        $this->assertCount(3, $this->store->withLogoToFetch(10));
    }

    public function testAnUnwritableLogoFolderIsAFailureNotACrash(): void
    {
        mkdir($this->root);
        file_put_contents($this->logoDir, 'a file where the folder should be');
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(FakeTransport::ok(self::PNG));

        $result = $this->fetcher()->run(10);

        $this->assertSame(['fetched' => 0, 'failed' => 1], $result);
        $this->assertNull($this->row($publicId)['logo_file']);
        unlink($this->logoDir);
    }

    public function testAThrowingTransportIsAFailureNotACrash(): void
    {
        $publicId = $this->stream('1', 'https://logos.test/a.png');
        $this->transport->push(new RuntimeException('boom'));

        $this->assertSame(['fetched' => 0, 'failed' => 1], $this->fetcher()->run(10));
        $this->assertSame(1, $this->row($publicId)['logo_tries']);
    }

    public function testStreamsWithoutAFetchableLogoAreIgnored(): void
    {
        $this->store->insertIfNew([
            'id' => StreamUrl::id('https://stream0.test/x'), 'public_id' => StreamUrl::publicId(StreamUrl::id('https://stream0.test/x')),
            'url' => 'https://stream0.test/x', 'name' => 'No logo', 'groups_json' => '["News"]', 'kind' => 'hls', 'source' => 'test',
        ]);
        $this->stream('9', 'https://logos.test/z.png', ['state' => 'held']);

        $this->assertSame(['fetched' => 0, 'failed' => 0], $this->fetcher()->run(10));
        $this->assertSame([], $this->transport->calls);
    }
}
