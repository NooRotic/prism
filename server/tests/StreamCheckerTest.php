<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Checker\StreamChecker;
use Prism\History\Net\FetchPolicy;
use Prism\History\Net\PinnedResponse;
use Prism\History\Net\PinnedTransport;
use Prism\History\Net\SafeFetcher;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\FakeResolver;
use Prism\History\Tests\Support\FakeTransport;
use RuntimeException;

final class StreamCheckerTest extends TestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';

    private const MASTER = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS=\"avc1.4d401f,mp4a.40.2\"\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh/index.m3u8\n";
    private const VOD = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg0.ts\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\nseg2.ts\n#EXT-X-ENDLIST\n";
    private const LIVE3 = "#EXTM3U\n#EXTINF:6.0,\nseg0.ts\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\nseg2.ts\n";
    private const LIVE2 = "#EXTM3U\n#EXTINF:6.0,\nseg0.ts\n#EXTINF:6.0,\nseg1.ts\n";

    private FakeTransport $transport;
    private FakeClock $clock;

    protected function setUp(): void
    {
        $this->transport = new FakeTransport();
        $this->clock = FakeClock::at('2026-11-15T00:00:00Z');
    }

    private function checker(?PinnedTransport $transport = null): StreamChecker
    {
        $fetcher = new SafeFetcher(
            new FakeResolver([
                'x.test' => ['93.184.216.34'],
                'cdn.test' => ['93.184.216.35'],
                'mytwitch.tv' => ['93.184.216.36'],
                'priv.test' => ['10.0.0.5'],
            ]),
            $transport ?? $this->transport,
            'PRISM-test/1',
            3,
            FetchPolicy::checker(),
        );

        return new StreamChecker($fetcher, self::ORIGIN, $this->clock);
    }

    /** @return array<string,mixed> */
    private function row(string $url = 'https://x.test/live/master.m3u8', string $kind = 'hls'): array
    {
        return ['url' => $url, 'kind' => $kind];
    }

    private static function cors(string $body, string $allow = '*'): PinnedResponse
    {
        return FakeTransport::ok($body, ['access-control-allow-origin' => $allow]);
    }

    private static function segment(int $bytes = 1000, int $status = 200, string $allow = '*'): PinnedResponse
    {
        return new PinnedResponse($status, ['access-control-allow-origin' => $allow], str_repeat('B', $bytes), false);
    }

    /** @return list<string> */
    private function urls(): array
    {
        return array_map(static fn (array $c): string => $c['url'], $this->transport->calls);
    }

    public function testAMasterThenTheFirstVariantThenTheFirstSegmentPasses(): void
    {
        $this->transport->push(self::cors(self::MASTER), self::cors(self::VOD), self::segment(1000));

        $r = $this->checker()->check($this->row());

        $this->assertSame('pass', $r->code);
        $this->assertSame(
            ['https://x.test/live/master.m3u8', 'https://x.test/live/low/index.m3u8', 'https://x.test/live/low/seg0.ts'],
            $this->urls(),
        );
        $this->assertSame(strlen(self::MASTER) + strlen(self::VOD) + 1000, $r->bytes);
    }

    public function testEveryRequestSendsPrismsOriginAndTheSegmentAsksForTheFirstBytesInProbeMode(): void
    {
        $this->transport->push(self::cors(self::MASTER), self::cors(self::VOD), self::segment());

        $this->checker()->check($this->row());

        [$manifest, $child, $segment] = $this->transport->calls;
        $this->assertSame(['Origin' => self::ORIGIN], $manifest['headers']);
        $this->assertSame(['Origin' => self::ORIGIN], $child['headers']);
        $this->assertSame(['Origin' => self::ORIGIN, 'Range' => 'bytes=0-65535'], $segment['headers']);
        $this->assertSame([false, false, true], [$manifest['probe'], $child['probe'], $segment['probe']]);
        $this->assertSame([256 * 1024, 256 * 1024, 65536], [$manifest['maxBytes'], $child['maxBytes'], $segment['maxBytes']]);
    }

    public function testAMediaPlaylistGivenDirectlyNeedsNoVariantStep(): void
    {
        $this->transport->push(self::cors(self::VOD), self::segment());

        $r = $this->checker()->check($this->row('https://x.test/a/media.m3u8'));

        $this->assertSame('pass', $r->code);
        $this->assertSame(['https://x.test/a/media.m3u8', 'https://x.test/a/seg0.ts'], $this->urls());
    }

    public function testALiveListWithThreeOrMoreSegmentsUsesTheSecondAndAVodListTheFirst(): void
    {
        foreach ([[self::LIVE3, 'seg1.ts'], [self::LIVE2, 'seg0.ts'], [self::VOD, 'seg0.ts']] as [$list, $expected]) {
            $this->transport = new FakeTransport();
            $this->transport->push(self::cors($list), self::segment());

            $this->checker()->check($this->row('https://x.test/a/media.m3u8'));

            $this->assertSame('https://x.test/a/' . $expected, $this->urls()[1], $expected);
        }
    }

    public function testASegmentCutAtSixtyFourKibIsAPass(): void
    {
        $this->transport->push(self::cors(self::VOD), new PinnedResponse(200, ['access-control-allow-origin' => '*'], str_repeat('B', 65536), true));

        $this->assertSame('pass', $this->checker()->check($this->row('https://x.test/a/media.m3u8'))->code);
    }

    public function testA206AnswerIsAPass(): void
    {
        $this->transport->push(self::cors(self::VOD), self::segment(4096, 206));

        $this->assertSame('pass', $this->checker()->check($this->row('https://x.test/a/media.m3u8'))->code);
    }

    /** @return array<string,array{0:list<PinnedResponse|\Throwable>,1:string,2:int}> */
    public static function failures(): array
    {
        return [
            'manifest 404' => [[new PinnedResponse(404, [], 'x', false)], 'http_status', 1],
            'manifest html' => [[self::cors('<html>not a playlist</html>')], 'not_playlist', 1],
            'master without a variant address' => [[self::cors("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n")], 'no_variant', 1],
            'variant is not a playlist' => [[self::cors(self::MASTER), self::cors('<html></html>')], 'no_variant', 2],
            'variant 500' => [[self::cors(self::MASTER), new PinnedResponse(500, [], '', false)], 'http_status', 2],
            'media playlist without segments' => [[self::cors("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-ENDLIST\n")], 'no_segment', 1],
            'segment 500' => [[self::cors(self::VOD), new PinnedResponse(500, ['access-control-allow-origin' => '*'], 'err', false)], 'segment_failed', 2],
            'segment 404' => [[self::cors(self::VOD), new PinnedResponse(404, ['access-control-allow-origin' => '*'], '', false)], 'segment_failed', 2],
            'segment with no bytes' => [[self::cors(self::VOD), self::segment(0)], 'segment_failed', 2],
            'transport status 0 on the manifest' => [[new PinnedResponse(0, [], '', false)], 'unreachable', 1],
            'transport throws on the manifest' => [[new RuntimeException('boom')], 'unreachable', 1],
            'transport throws on the segment' => [[self::cors(self::VOD), new RuntimeException('boom')], 'unreachable', 2],
            'manifest over the playlist cap' => [[new PinnedResponse(200, ['access-control-allow-origin' => '*'], str_repeat('A', 100), true)], 'too_large', 1],
            'too many redirects' => [[FakeTransport::redirect('/a'), FakeTransport::redirect('/b'), FakeTransport::redirect('/c'), FakeTransport::redirect('/d'), FakeTransport::redirect('/e')], 'redirects', 4],
        ];
    }

    /** @param list<PinnedResponse|\Throwable> $responses */
    #[DataProvider('failures')]
    public function testEachWayACheckFailsHasItsOwnCode(array $responses, string $code, int $requests): void
    {
        $this->transport->push(...$responses);

        $r = $this->checker()->check($this->row('https://x.test/live/index.m3u8'));

        $this->assertSame($code, $r->code);
        $this->assertCount($requests, $this->transport->calls, 'no request beyond the one that failed');
    }

    public function testANameThatDoesNotResolveIsUnreachable(): void
    {
        $r = $this->checker()->check($this->row('https://nxdomain.test/a.m3u8'));

        $this->assertSame('unreachable', $r->code);
        $this->assertSame([], $this->transport->calls);
    }

    /** @return array<string,array{0:string,1:string}> */
    public static function refusedAddresses(): array
    {
        return [
            'a child playlist over http' => ['#child', 'insecure'],
            'a segment over http' => ['#segment-http', 'insecure'],
            'a segment on a private address' => ['#segment-private', 'blocked'],
            'a segment on port 22' => ['#segment-port', 'blocked'],
            'a segment on a restricted port' => ['#segment-6000', 'blocked'],
        ];
    }

    #[DataProvider('refusedAddresses')]
    public function testAnAddressInsideAPlaylistThatTheGuardRefusesIsNeverFetched(string $case, string $code): void
    {
        $media = static fn (string $uri): string => "#EXTM3U\n#EXTINF:6.0,\n{$uri}\n#EXT-X-ENDLIST\n";
        $responses = match ($case) {
            '#child' => [self::cors("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://x.test/low.m3u8\n")],
            '#segment-http' => [self::cors($media('http://x.test/s.ts'))],
            '#segment-private' => [self::cors($media('https://priv.test/s.ts'))],
            '#segment-port' => [self::cors($media('https://x.test:22/s.ts'))],
            '#segment-6000' => [self::cors($media('https://x.test:6000/s.ts'))],
        };
        $this->transport->push(...$responses);

        $r = $this->checker()->check($this->row('https://x.test/a/media.m3u8'));

        $this->assertSame($code, $r->code);
        $this->assertCount(1, $this->transport->calls, 'only the manifest was requested');
    }

    public function testMissingCorsOnTheManifestTheChildPlaylistOrTheSegmentIsNoCors(): void
    {
        $this->transport->push(FakeTransport::ok(self::MASTER));
        $this->assertSame('no_cors', $this->checker()->check($this->row())->code, 'manifest');

        $this->transport = new FakeTransport();
        $this->transport->push(self::cors(self::MASTER), FakeTransport::ok(self::VOD));
        $this->assertSame('no_cors', $this->checker()->check($this->row())->code, 'child playlist');

        $this->transport = new FakeTransport();
        $this->transport->push(self::cors(self::MASTER), self::cors(self::VOD), new PinnedResponse(200, [], str_repeat('B', 10), false));
        $this->assertSame('no_cors', $this->checker()->check($this->row())->code, 'segment');
    }

    public function testTheOriginItselfAllowsButAnotherOriginDoesNot(): void
    {
        $this->transport->push(self::cors(self::VOD, self::ORIGIN), self::segment(10, 200, self::ORIGIN));
        $this->assertSame('pass', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code);

        $this->transport = new FakeTransport();
        $this->transport->push(self::cors(self::VOD, 'https://evil.test'));
        $this->assertSame('no_cors', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code);
    }

    public function testARedirectResponseMustAllowCorsToo(): void
    {
        $this->transport->push(
            new PinnedResponse(302, ['location' => '/real.m3u8'], '', false),
            self::cors(self::VOD),
        );

        $this->assertSame('no_cors', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code);
    }

    public function testAfterACrossOriginRedirectOnlyAWildcardOrNullAllows(): void
    {
        $redirect = new PinnedResponse(302, ['location' => 'https://cdn.test/real.m3u8', 'access-control-allow-origin' => self::ORIGIN], '', false);
        $this->transport->push($redirect, self::cors(self::VOD, self::ORIGIN));
        $this->assertSame('no_cors', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code, 'the browser sent Origin: null on that hop');
        $this->assertSame('null', $this->transport->calls[1]['headers']['Origin']);

        $this->transport = new FakeTransport();
        $this->transport->push($redirect, self::cors(self::VOD, '*'), self::segment());
        $this->assertSame('pass', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code);

        $this->transport = new FakeTransport();
        $this->transport->push($redirect, self::cors(self::VOD, 'null'), self::segment(10, 200, self::ORIGIN));
        $this->assertSame('pass', $this->checker()->check($this->row('https://x.test/a/m.m3u8'))->code);
    }

    public function testADashManifestIsCheckedAtManifestLevelOnly(): void
    {
        $this->transport->push(self::cors('<?xml version="1.0"?><MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011"></MPD>'));

        $r = $this->checker()->check($this->row('https://x.test/a/manifest.mpd', 'dash'));

        $this->assertSame('pass', $r->code);
        $this->assertCount(1, $this->transport->calls);
        $this->assertFalse($r->facts['live']);
    }

    public function testADashManifestThatIsNotAnMpdOrLacksCorsFails(): void
    {
        $this->transport->push(self::cors('<html></html>'));
        $this->assertSame('not_playlist', $this->checker()->check($this->row('https://x.test/m.mpd', 'dash'))->code);

        $this->transport = new FakeTransport();
        $this->transport->push(FakeTransport::ok('<MPD type="dynamic"></MPD>'));
        $this->assertSame('no_cors', $this->checker()->check($this->row('https://x.test/m.mpd', 'dash'))->code);

        $this->transport = new FakeTransport();
        $this->transport->push(self::cors('<MPD type="dynamic"></MPD>'));
        $this->assertTrue($this->checker()->check($this->row('https://x.test/m.mpd', 'dash'))->facts['live']);
    }

    /** @return array<string,array{0:string}> */
    public static function deniedHosts(): array
    {
        return [
            'twitch.tv' => ['https://twitch.tv/a'], 'www.twitch.tv' => ['https://www.twitch.tv/a'], 'ttvnw.net' => ['https://usher.ttvnw.net/a.m3u8'],
            'jtvnw.net' => ['https://static-cdn.jtvnw.net/a'], 'youtube.com' => ['https://www.youtube.com/watch'], 'a subdomain' => ['https://x.youtube.com/a'],
            'youtu.be' => ['https://youtu.be/abc'], 'googlevideo.com' => ['https://r1---sn.googlevideo.com/a'], 'ytimg.com' => ['https://i.ytimg.com/a'],
        ];
    }

    #[DataProvider('deniedHosts')]
    public function testTwitchAndYouTubeHostsAreNeverFetched(string $url): void
    {
        $r = $this->checker()->check($this->row($url));

        $this->assertSame('skipped', $r->code);
        $this->assertSame([], $this->transport->calls);
    }

    public function testAHostThatOnlyEndsLikeADeniedNameIsNotDenied(): void
    {
        $this->transport->push(self::cors(self::VOD), self::segment());

        $this->assertSame('pass', $this->checker()->check($this->row('https://mytwitch.tv/a/m.m3u8'))->code);
    }

    public function testRequestsToOneHostAreSpacedByThePacerBeforeEachRequest(): void
    {
        $sleeper = new \Prism\History\Tests\Support\FakeSleeper($this->clock);
        $pacer = new \Prism\History\Checker\HostPacer($sleeper, $this->clock);
        $fetcher = new SafeFetcher(new FakeResolver(['x.test' => ['93.184.216.34']]), $this->transport, 'PRISM-test/1', 3, FetchPolicy::checker());
        $this->transport->push(self::cors(self::MASTER), self::cors(self::VOD), self::segment());

        $r = (new StreamChecker($fetcher, self::ORIGIN, $this->clock, StreamChecker::DENY_HOSTS, $pacer))->check($this->row());

        $this->assertSame('pass', $r->code);
        $this->assertSame([1000, 1000], $sleeper->calls, 'manifest, variant and segment come a second apart');
    }

    public function testAStreamThatTakesMoreThanThirtySecondsInTotalIsUnreachable(): void
    {
        $clock = $this->clock;
        $inner = $this->transport;
        $slow = new class ($clock, $inner) implements PinnedTransport {
            public function __construct(private FakeClock $clock, private FakeTransport $inner)
            {
            }

            public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = '', array $requestHeaders = [], bool $probe = false): PinnedResponse
            {
                $this->clock->advanceMs(31_000);

                return $this->inner->get($url, $ip, $port, $maxBytes, $timeoutSec, $userAgent, $requestHeaders, $probe);
            }
        };
        $this->transport->push(self::cors(self::MASTER), self::cors(self::VOD), self::segment());

        $r = $this->checker($slow)->check($this->row());

        $this->assertSame('unreachable', $r->code);
        $this->assertCount(1, $this->transport->calls, 'no second request once the time is up');
    }

    public function testFactsAreRecordedAndNothingInAResultNamesTheStream(): void
    {
        $master = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",LANGUAGE=\"en\",NAME=\"English\"\n#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS=\"avc1.4d401f,mp4a.40.2\"\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2\nhigh.m3u8\n";
        $this->transport->push(self::cors($master), self::cors(self::LIVE3), self::segment());

        $r = $this->checker()->check($this->row());

        $this->assertSame('pass', $r->code);
        $this->assertTrue($r->facts['live']);
        $this->assertSame(2, $r->facts['variants']);
        $this->assertSame(['avc1.4d401f', 'mp4a.40.2'], $r->facts['codecs']);
        $this->assertSame(['en'], $r->facts['audio_languages']);
        $this->assertStringNotContainsString('x.test', (string) json_encode([$r->code, $r->facts]));
    }

    public function testAFailureResultNamesNeitherTheStreamNorTheOtherSide(): void
    {
        $this->transport->push(new PinnedResponse(500, [], 'internal error at https://x.test/secret?token=abc', false));

        $r = $this->checker()->check($this->row());

        $this->assertSame('http_status', $r->code);
        $this->assertStringNotContainsString('secret', (string) json_encode([$r->code, $r->facts]));
        $this->assertSame([], $r->facts);
    }
}
