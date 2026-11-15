<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\PlaylistReader;

final class PlaylistReaderTest extends TestCase
{
    private const MASTER = <<<'M3U'
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANGUAGE="en",NAME="English",URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANGUAGE="es",NAME="Spanish",URI="audio/es.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",URI="subs/en.m3u8"
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="fr",NAME="Francais",INSTREAM-ID="CC1"
#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="aud"
low/index.m3u8
# a comment between the tag and its address

#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud"
https://cdn.test/high/index.m3u8
M3U;

    private const MEDIA_VOD = <<<'M3U'
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg0.ts
#EXTINF:6.0,
#EXT-X-BYTERANGE:1000@0
seg1.ts
#EXT-X-ENDLIST
M3U;

    public function testAMasterPlaylistGivesItsVariantAddressesInOrderAndItsFacts(): void
    {
        $p = PlaylistReader::parse(self::MASTER);

        $this->assertTrue($p['master']);
        $this->assertSame(['low/index.m3u8', 'https://cdn.test/high/index.m3u8'], $p['variants']);
        $this->assertSame([], $p['segments']);
        $this->assertSame(2, $p['facts']['variants']);
        $this->assertSame(['avc1.4d401f', 'mp4a.40.2', 'avc1.640028'], $p['facts']['codecs']);
        $this->assertSame(['SUBTITLES:en', 'CLOSED-CAPTIONS:fr'], $p['facts']['captions']);
        $this->assertSame(['en', 'es'], $p['facts']['audio_languages']);
    }

    public function testAMediaPlaylistGivesItsSegmentsAndIsOnDemandWhenItEnds(): void
    {
        $p = PlaylistReader::parse(self::MEDIA_VOD);

        $this->assertFalse($p['master']);
        $this->assertSame(['seg0.ts', 'seg1.ts'], $p['segments'], 'a tag between #EXTINF and the address is skipped');
        $this->assertSame([], $p['variants']);
        $this->assertFalse($p['live']);
    }

    public function testAMediaPlaylistWithNoEndTagIsLive(): void
    {
        $p = PlaylistReader::parse("#EXTM3U\n#EXTINF:6.0,\na.ts\n#EXTINF:6.0,\nb.ts\n");

        $this->assertTrue($p['live']);
        $this->assertSame(['a.ts', 'b.ts'], $p['segments']);
    }

    public function testSomethingThatIsNotAPlaylistGivesNothing(): void
    {
        $p = PlaylistReader::parse("<html><body>#EXTM3U</body></html>");

        $this->assertFalse($p['master']);
        $this->assertSame([], $p['variants']);
        $this->assertSame([], $p['segments']);
        $this->assertFalse(PlaylistReader::isPlaylist('<html>'));
        $this->assertFalse(PlaylistReader::isPlaylist(''));
    }

    public function testABomAndLeadingBlankLinesDoNotHideAPlaylist(): void
    {
        $this->assertTrue(PlaylistReader::isPlaylist("\xEF\xBB\xBF#EXTM3U\n#EXTINF:1,\na.ts\n"));
        $this->assertTrue(PlaylistReader::isPlaylist("\n  \r\n#EXTM3U\r\n"));
        $this->assertSame(['a.ts'], PlaylistReader::parse("\xEF\xBB\xBF#EXTM3U\r\n#EXTINF:1,\r\na.ts\r\n")['segments'], 'CRLF line ends are fine');
    }

    public function testFactsAreCleanedAndBounded(): void
    {
        $codecs = [];
        for ($i = 0; $i < 40; $i++) {
            $codecs[] = 'c' . $i;
        }
        $body = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE=\"e n<script>\",NAME=\"x\"\n#EXT-X-STREAM-INF:CODECS=\"" . implode(',', $codecs) . ",<b>bad</b>\"\nv.m3u8\n";

        $p = PlaylistReader::parse($body);

        $this->assertCount(20, $p['facts']['codecs'], 'at most twenty');
        $this->assertSame(['enscript'], $p['facts']['audio_languages'], 'only letters, digits, dots, dashes and underscores survive');
        foreach ($p['facts']['codecs'] as $codec) {
            $this->assertMatchesRegularExpression('/^[A-Za-z0-9._-]{1,40}$/D', $codec);
        }
    }
}
