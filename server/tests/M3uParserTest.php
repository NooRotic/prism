<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Playlist\M3uParser;

final class M3uParserTest extends TestCase
{
    public function testParsesTheRealFileShape(): void
    {
        $text = <<<'M3U'
#EXTM3U
#EXTINF:-1 tvg-id="1TwenteTV.nl@SD" tvg-logo="https://i.imgur.com/ftiuNK3.png" group-title="General",1Twente TV (1080p)
https://ms7.mx-cd.net/dtv-11/198-989148/1Twente_TV.smil/chunklist_w954512639_b4292608_slNLD.m3u8
#EXTINF:-1 tvg-id="1KZNTV.za" tvg-logo="https://admango.cdn.mangomolo.com/analytics/uploads/188/6544bebaae.jpg" group-title="Entertainment;Family;General",1KZN TV (576p)
https://cdn.freevisiontv.co.za/sttv/smil:1kzn.stream.smil/playlist.m3u8
#EXTINF:-1 tvg-id="2STV.sn" tvg-logo="https://i.imgur.com/WByVBZf.png" group-title="Culture",2STV
http://69.64.57.208/2stv/playlist.m3u8
M3U;

        $entries = M3uParser::parse($text);

        $this->assertCount(3, $entries);
        $this->assertSame('1TwenteTV.nl@SD', $entries[0]->tvgId);
        $this->assertSame('https://i.imgur.com/ftiuNK3.png', $entries[0]->logo);
        $this->assertSame('General', $entries[0]->group);
        $this->assertSame('1Twente TV (1080p)', $entries[0]->name);
        $this->assertSame('https://ms7.mx-cd.net/dtv-11/198-989148/1Twente_TV.smil/chunklist_w954512639_b4292608_slNLD.m3u8', $entries[0]->url);
        $this->assertFalse($entries[0]->hasPlayerOptions);
        $this->assertSame('Entertainment;Family;General', $entries[1]->group);
        $this->assertSame('1KZN TV (576p)', $entries[1]->name);
        $this->assertSame('2STV', $entries[2]->name);
        $this->assertSame('http://69.64.57.208/2stv/playlist.m3u8', $entries[2]->url);
    }

    public function testPlayerOptionsAreFlagged(): void
    {
        $text = <<<'M3U'
#EXTM3U
#EXTINF:-1 tvg-id="12tv.es" tvg-logo="" group-title="General" http-referrer="https://www.12tv.es/",12tv
#EXTVLCOPT:http-referrer=https://www.12tv.es/
https://cloud.example.test/12tv.m3u8
#EXTINF:-1 tvg-id="plain.es" tvg-logo="" group-title="General",Plain
https://cloud.example.test/plain.m3u8
#EXTINF:-1 tvg-id="headersonly.es" tvg-logo="" group-title="General" http-user-agent="Foo/1",Header Attribute Only
https://cloud.example.test/headers.m3u8
#EXTINF:-1 tvg-id="exthttp.es" tvg-logo="" group-title="General",Ext Http
#EXTHTTP:{"cookie":"a=b"}
https://cloud.example.test/exthttp.m3u8
#EXTINF:-1 tvg-id="last.es" tvg-logo="" group-title="General",Last
https://cloud.example.test/last.m3u8
M3U;

        $entries = M3uParser::parse($text);

        $this->assertSame(
            [true, false, true, true, false],
            array_map(static fn ($e): bool => $e->hasPlayerOptions, $entries),
            'the flag belongs to its own entry and never leaks to the next one',
        );
    }

    public function testCommasInsideQuotesDoNotSplitTheName(): void
    {
        $entries = M3uParser::parse(
            "#EXTINF:-1 tvg-id=\"A.us\" group-title=\"News, Weather\" tvg-logo=\"https://x.test/a,b.png\",My Channel\nhttps://x.test/a.m3u8\n",
        );

        $this->assertCount(1, $entries);
        $this->assertSame('My Channel', $entries[0]->name);
        $this->assertSame('News, Weather', $entries[0]->group);
        $this->assertSame('https://x.test/a,b.png', $entries[0]->logo);
    }

    public function testCrlfAndBomAndBlankLines(): void
    {
        $text = "\xEF\xBB\xBF#EXTM3U\r\n\r\n#EXTINF:-1 tvg-id=\"A.us\" tvg-logo=\"\" group-title=\"News\",Alpha\r\n\r\nhttps://x.test/a.m3u8\r\n\r\n"
            . "#EXTINF:-1 tvg-id=\"B.us\" tvg-logo=\"\" group-title=\"News\",Beta\r\n   https://x.test/b.m3u8   \r\n";

        $entries = M3uParser::parse($text);

        $this->assertSame(['Alpha', 'Beta'], array_map(static fn ($e): string => $e->name, $entries));
        $this->assertSame(['https://x.test/a.m3u8', 'https://x.test/b.m3u8'], array_map(static fn ($e): string => $e->url, $entries));
    }

    public function testOrphansAreDropped(): void
    {
        $text = <<<'M3U'
#EXTM3U
#EXTINF:-1 tvg-id="orphan1.us" tvg-logo="" group-title="News",Info With No Address
#EXTINF:-1 tvg-id="ok.us" tvg-logo="" group-title="News",Good One
https://x.test/ok.m3u8
https://x.test/address-with-no-info.m3u8
# a plain comment line
#EXTINF:-1 tvg-id="orphan2.us" tvg-logo="" group-title="News",Info At The End
M3U;

        $entries = M3uParser::parse($text);

        $this->assertCount(1, $entries);
        $this->assertSame('Good One', $entries[0]->name);
        $this->assertSame('https://x.test/ok.m3u8', $entries[0]->url);
    }

    public function testHostileTextIsKeptAsDataNotInterpreted(): void
    {
        $nul = "\x00";
        $text = '#EXTINF:-1 tvg-id="a' . $nul . 'b\\nc.us" tvg-logo="javascript:alert(1)" group-title="<img src=x onerror=alert(1)>",<script>alert("x")</script>' . str_repeat('N', 5000) . "\n"
            . "https://x.test/a.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"c.us\" tvg-logo=\"\" group-title=\"G\",Bad\xFF\xFEBytes and \u{202E}override\n"
            . "https://x.test/c.m3u8\n";

        $entries = M3uParser::parse($text);

        $this->assertCount(2, $entries);
        // A NUL is removed; a backslash followed by n is two ordinary characters, not a newline.
        $this->assertSame('ab\\nc.us', $entries[0]->tvgId);
        // Markup is data: kept exactly as written (the page escapes it), only cut to length.
        $this->assertSame('<img src=x onerror=alert(1)>', $entries[0]->group);
        $this->assertStringStartsWith('<script>alert("x")</script>NNN', $entries[0]->name);
        $this->assertSame(200, mb_strlen($entries[0]->name));
        // Nothing here is interpreted as an address; the parser does not judge the logo, the rules do.
        $this->assertSame('javascript:alert(1)', $entries[0]->logo);
        // Invalid UTF-8 is repaired and a bidirectional override is removed, so the stored text is clean.
        $this->assertTrue(mb_check_encoding($entries[1]->name, 'UTF-8'));
        $this->assertStringNotContainsString("\u{202E}", $entries[1]->name);
        $this->assertStringContainsString('Bytes and override', $entries[1]->name);
    }

    public function testLongNamesAreTruncatedTo200(): void
    {
        $long = str_repeat('é', 300);

        $entries = M3uParser::parse("#EXTINF:-1 tvg-id=\"a.us\" tvg-logo=\"\" group-title=\"G\",{$long}\nhttps://x.test/a.m3u8\n");

        $this->assertSame(200, mb_strlen($entries[0]->name));
        $this->assertSame(str_repeat('é', 200), $entries[0]->name);
    }

    public function testAMissingAttributeIsAnEmptyString(): void
    {
        $entries = M3uParser::parse("#EXTINF:-1,Bare Name\nhttps://x.test/a.m3u8\n");

        $this->assertCount(1, $entries);
        $this->assertSame(['', '', '', 'Bare Name'], [$entries[0]->tvgId, $entries[0]->logo, $entries[0]->group, $entries[0]->name]);
    }
}
