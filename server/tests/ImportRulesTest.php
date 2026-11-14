<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Playlist\ImportRules;
use Prism\History\Playlist\M3uEntry;

final class ImportRulesTest extends TestCase
{
    private function entry(string $url, string $group = 'News', string $tvgId = 'Alpha.us', bool $options = false): M3uEntry
    {
        return new M3uEntry($tvgId, '', $group, 'Alpha', $url, $options);
    }

    private function reject(M3uEntry $e): string
    {
        $d = ImportRules::judge($e);
        $this->assertSame('reject', $d->verdict);
        $this->assertNull($d->state);
        $this->assertNull($d->normalisedUrl);
        $this->assertNotNull($d->reason);

        return $d->reason;
    }

    public function testEachRejectReasonAndTheirOrder(): void
    {
        $this->assertSame('player_options', $this->reject($this->entry('https://x.test/a.m3u8', 'News', 'A.us', true)));
        $this->assertSame('credentials', $this->reject($this->entry('https://user:pw@x.test/a.m3u8')));
        $this->assertSame('credentials', $this->reject($this->entry('https://user@x.test/a.m3u8')));
        $this->assertSame('bad_address', $this->reject($this->entry('rtmp://x.test/live')));
        $this->assertSame('bad_address', $this->reject($this->entry('not an address')));
        $this->assertSame('bad_address', $this->reject($this->entry('')));
        $this->assertSame('token', $this->reject($this->entry('https://x.test/a.m3u8?token=abc')));
        $this->assertSame('adult', $this->reject($this->entry('https://x.test/a.m3u8', 'XXX')));

        // The first match wins, in the order: player options, credentials, bad address, token, adult.
        $this->assertSame('player_options', $this->reject($this->entry('https://u:p@x.test/a?token=1', 'XXX', 'A.us', true)));
        $this->assertSame('credentials', $this->reject($this->entry('https://u:p@x.test/a?token=1', 'XXX')));
        $this->assertSame('credentials', $this->reject($this->entry('ftp://u:p@x.test/a', 'XXX')));
        $this->assertSame('bad_address', $this->reject($this->entry('rtmp://x.test/a?token=1', 'XXX')));
        $this->assertSame('token', $this->reject($this->entry('https://x.test/a?token=1', 'XXX')));
    }

    public function testAnAddressTooLongToStoreIsABadAddress(): void
    {
        $this->assertSame('bad_address', $this->reject($this->entry('https://x.test/' . str_repeat('a', 1000))));

        $this->assertSame('accept', ImportRules::judge($this->entry('https://x.test/' . str_repeat('a', 900)))->verdict);
    }

    /** @return array<string,array{0:string}> */
    public static function tokenNames(): array
    {
        $names = ['token', 'tok', 'key', 'apikey', 'api_key', 'auth', 'authorization', 'password', 'pass', 'pwd', 'secret', 'sig', 'signature', 'hdnts', 'hdnea', 'wmsauthsign', 'expires', 'exp'];

        return array_combine($names, array_map(static fn (string $n): array => [$n], $names));
    }

    #[DataProvider('tokenNames')]
    public function testEveryTokenLikeParameterNameIsRejectedWhateverItsCase(string $name): void
    {
        $this->assertSame('token', $this->reject($this->entry('https://x.test/a.m3u8?a=1&' . strtoupper($name) . '=v')));
        $this->assertSame('token', $this->reject($this->entry('https://x.test/a.m3u8?' . $name . '=v&b=2')));
        $this->assertSame('token', $this->reject($this->entry('https://x.test/a.m3u8?' . $name)));
    }

    public function testOnlyTheParameterNameCountsNotTheValueOrThePath(): void
    {
        foreach (['https://x.test/a.m3u8?title=token', 'https://x.test/token/a.m3u8', 'https://x.test/a.m3u8?tokens=1', 'https://x.test/a.m3u8?quality=hd&lang=en'] as $url) {
            $this->assertSame('accept', ImportRules::judge($this->entry($url))->verdict, $url);
        }
    }

    public function testHttpIsUnplayableNotRejected(): void
    {
        $d = ImportRules::judge($this->entry('http://x.test/a.m3u8'));

        $this->assertSame('accept', $d->verdict);
        $this->assertSame('unplayable', $d->state);
        $this->assertSame('http', $d->reason);
        $this->assertSame('http://x.test/a.m3u8', $d->normalisedUrl);
    }

    public function testOddPortIsHeldNotRejected(): void
    {
        $d = ImportRules::judge($this->entry('https://X.test:8443/a.m3u8'));

        $this->assertSame('accept', $d->verdict);
        $this->assertSame('held', $d->state);
        $this->assertSame('port', $d->reason);
        $this->assertSame('https://x.test:8443/a.m3u8', $d->normalisedUrl);
    }

    public function testHttpsOn443AndHttpOn80AreNormalPorts(): void
    {
        $https = ImportRules::judge($this->entry('https://x.test:443/a.m3u8'));
        $this->assertSame(['accept', 'new', null, 'https://x.test/a.m3u8'], [$https->verdict, $https->state, $https->reason, $https->normalisedUrl]);

        $plain = ImportRules::judge($this->entry('https://x.test/a.m3u8'));
        $this->assertSame(['accept', 'new', null], [$plain->verdict, $plain->state, $plain->reason]);

        $http = ImportRules::judge($this->entry('http://x.test:80/a.m3u8'));
        $this->assertSame(['accept', 'unplayable', 'http'], [$http->verdict, $http->state, $http->reason], 'http is unplayable for being http, not held for its port');

        $crossed = ImportRules::judge($this->entry('https://x.test:80/a.m3u8'));
        $this->assertSame(['accept', 'new'], [$crossed->verdict, $crossed->state]);
    }

    public function testGroupsSplitTrimAndUndefinedBecomesOther(): void
    {
        $groups = static fn (string $g): array => ImportRules::judge(new M3uEntry('A.us', '', $g, 'A', 'https://x.test/a.m3u8', false))->groups;

        $this->assertSame(['Entertainment', 'Family', 'General'], $groups('Entertainment;Family;General'));
        $this->assertSame(['News', 'Sports'], $groups(' News ; ;Sports;'));
        $this->assertSame(['Other'], $groups('Undefined'));
        $this->assertSame(['Other'], $groups('undefined'));
        $this->assertSame(['Other'], $groups(''));
        $this->assertSame(['Other'], $groups(' ; '));
        $this->assertSame(['News', 'Other'], $groups('News;Undefined'));
        $this->assertSame(['News'], $groups('News;News'));
    }

    public function testGroupNamesAndTheirNumberAreBoundedSoTheyFitTheColumn(): void
    {
        $many = implode(';', array_map(static fn (int $i): string => 'Group' . $i, range(1, 12)));
        $this->assertCount(5, ImportRules::judge($this->entry('https://x.test/a.m3u8', $many))->groups);

        $long = ImportRules::judge($this->entry('https://x.test/a.m3u8', str_repeat('é', 120)))->groups;
        $this->assertSame([str_repeat('é', 40)], $long);
    }

    public function testKindAndCountryFromTheEntry(): void
    {
        $dash = ImportRules::judge($this->entry('https://x.test/live/manifest.mpd?a=1', 'News', 'Foo.us'));
        $this->assertSame('dash', $dash->kind);
        $this->assertSame('us', $dash->country);

        $hls = ImportRules::judge($this->entry('https://x.test/live/index.m3u8', 'News', 'Foo.uk'));
        $this->assertSame('hls', $hls->kind);
        $this->assertSame('gb', $hls->country, 'uk is the playlist\'s spelling of gb');

        $none = ImportRules::judge($this->entry('https://x.test/live/index.m3u8', 'News', 'NoSuffix'));
        $this->assertNull($none->country);

        $quality = ImportRules::judge($this->entry('https://x.test/a.m3u8', 'News', 'ChannelName.us@SD'));
        $this->assertSame('us', $quality->country);

        $dotted = ImportRules::judge($this->entry('https://x.test/a.m3u8', 'News', 'Some.Dotted.Name.FR@HD'));
        $this->assertSame('fr', $dotted->country);

        $atOnly = ImportRules::judge($this->entry('https://x.test/a.m3u8', 'News', 'Name@SD'));
        $this->assertNull($atOnly->country);

        $empty = ImportRules::judge($this->entry('https://x.test/a.m3u8', 'News', ''));
        $this->assertNull($empty->country);

        $notACountry = ImportRules::judge($this->entry('https://x.test/a.m3u8', 'News', 'Foo.abc'));
        $this->assertNull($notACountry->country);
    }

    public function testAdultWordsOnlyMatchWholeWords(): void
    {
        foreach (['Essex', 'Sussex', 'Adulthood', 'Pornography', 'Sextant', 'Movies18', 'Classic'] as $group) {
            $this->assertSame('accept', ImportRules::judge($this->entry('https://x.test/a.m3u8', $group))->verdict, $group);
        }
        foreach (['XXX', 'xxx', 'Adult', 'ADULT Movies', 'Porn', 'Erotic', 'Sex', 'Hentai', '18+', 'Late 18+ Night', 'News;XXX', 'Sports; Adult '] as $group) {
            $this->assertSame('adult', $this->reject($this->entry('https://x.test/a.m3u8', $group)), $group);
        }
    }

    public function testTheDecisionOfAnAcceptedEntryCarriesTheNormalisedAddress(): void
    {
        $d = ImportRules::judge($this->entry("  HTTPS://Example.COM:443/Path/A.m3u8#frag "));

        $this->assertSame('https://example.com/Path/A.m3u8', $d->normalisedUrl);
    }
}
