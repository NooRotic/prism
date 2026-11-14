<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Playlist\DemoStreams;
use Prism\History\Playlist\Importer;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use RuntimeException;

final class ImporterTest extends DbTestCase
{
    private StreamStore $store;
    private Importer $importer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->importer = new Importer($this->store, $this->clock);
    }

    /** A file with every kind of entry the rules know about: 11 entries, 5 stored, 1 duplicate, 5 rejected. */
    private function handBuiltFile(): string
    {
        return <<<'M3U'
#EXTM3U
#EXTINF:-1 tvg-id="Alpha.us" tvg-logo="https://logos.test/alpha.png" group-title="News",Alpha
https://a.test/alpha.m3u8
#EXTINF:-1 tvg-id="Beta.uk@SD" tvg-logo="" group-title="General;News",Beta
https://B.test:443/beta.m3u8#x
#EXTINF:-1 tvg-id="Alpha.us" tvg-logo="" group-title="News",Alpha again
https://a.test:443/alpha.m3u8
#EXTINF:-1 tvg-id="Gamma.us" tvg-logo="" group-title="News",Gamma
http://c.test/gamma.m3u8
#EXTINF:-1 tvg-id="Delta.us" tvg-logo="" group-title="News",Delta
https://d.test:8443/delta.m3u8
#EXTINF:-1 tvg-id="Eps.us" tvg-logo="" group-title="News",Epsilon
#EXTVLCOPT:http-referrer=https://e.test/
https://e.test/eps.m3u8
#EXTINF:-1 tvg-id="Zeta.us" tvg-logo="" group-title="News",Zeta
https://user:pw@f.test/zeta.m3u8
#EXTINF:-1 tvg-id="Eta.us" tvg-logo="" group-title="News",Eta
rtmp://g.test/live
#EXTINF:-1 tvg-id="Theta.us" tvg-logo="" group-title="News",Theta
https://h.test/theta.m3u8?token=abc
#EXTINF:-1 tvg-id="Iota.us" tvg-logo="" group-title="XXX",Iota
https://i.test/iota.m3u8
#EXTINF:-1 tvg-id="Kappa.fr" tvg-logo="" group-title="Undefined",Kappa
https://k.test/live/manifest.mpd
M3U;
    }

    /** @return array<string,int> */
    private function expectedFirstImport(): array
    {
        return [
            'entries' => 11, 'inserted' => 5, 'already_known' => 0, 'duplicates' => 1,
            'rejected_player_options' => 1, 'rejected_credentials' => 1, 'rejected_bad_address' => 1,
            'rejected_token' => 1, 'rejected_adult' => 1, 'unplayable_http' => 1, 'held_port' => 1,
        ];
    }

    /** @return list<array<string,mixed>> */
    private function dump(): array
    {
        return $this->pdo->query('SELECT * FROM streams ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    }

    public function testCountsMatchAHandBuiltFile(): void
    {
        $counts = $this->importer->import($this->handBuiltFile(), 'unit-test', true);

        $this->assertEquals($this->expectedFirstImport(), $counts);
        $this->assertSame(
            $counts['entries'],
            $counts['inserted'] + $counts['already_known'] + $counts['duplicates']
                + $counts['rejected_player_options'] + $counts['rejected_credentials'] + $counts['rejected_bad_address']
                + $counts['rejected_token'] + $counts['rejected_adult'],
            'every entry is counted exactly once',
        );
        $this->assertSame(
            ['new' => 3, 'unplayable' => 1, 'held' => 1],
            $this->store->countsByState(),
        );
    }

    public function testStoredRowsCarryTheDecision(): void
    {
        $this->importer->import($this->handBuiltFile(), 'batch-1', true);

        $alpha = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('https://a.test/alpha.m3u8')));
        $this->assertNotNull($alpha);
        $this->assertSame(['Alpha', 'https://a.test/alpha.m3u8', '["News"]', 'us', 'hls', 'new', null, 0, 0, 'batch-1', 'https://logos.test/alpha.png', '2026-11-12 03:00:00'], [
            $alpha['name'], $alpha['url'], $alpha['groups_json'], $alpha['country'], $alpha['kind'], $alpha['state'], $alpha['state_reason'],
            $alpha['pinned'], $alpha['is_default'], $alpha['source'], $alpha['logo_url'], $alpha['added_at'],
        ]);

        $beta = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('https://b.test/beta.m3u8')));
        $this->assertNotNull($beta);
        $this->assertSame(['["General","News"]', 'gb', null], [$beta['groups_json'], $beta['country'], $beta['logo_url']]);

        $dash = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('https://k.test/live/manifest.mpd')));
        $this->assertSame(['dash', '["Other"]', 'fr'], [$dash['kind'] ?? null, $dash['groups_json'] ?? null, $dash['country'] ?? null]);

        $http = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('http://c.test/gamma.m3u8')));
        $this->assertSame(['unplayable', 'http'], [$http['state'] ?? null, $http['state_reason'] ?? null]);
        $held = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('https://d.test:8443/delta.m3u8')));
        $this->assertSame(['held', 'port'], [$held['state'] ?? null, $held['state_reason'] ?? null]);
    }

    public function testReimportChangesNothing(): void
    {
        $this->importer->import($this->handBuiltFile(), 'first', true);
        $before = $this->dump();
        $this->clock->advanceMs(86_400_000);

        $again = $this->importer->import($this->handBuiltFile(), 'second', true);

        $this->assertSame($before, $this->dump(), 'ids, names, sources and times are all unchanged');
        $this->assertSame(0, $again['inserted']);
        $this->assertSame(5, $again['already_known']);
        $this->assertSame(1, $again['duplicates']);
    }

    public function testARemovedStreamIsNeverRevived(): void
    {
        $this->importer->import($this->handBuiltFile(), 'first', true);
        $id = StreamUrl::id('https://a.test/alpha.m3u8');
        $this->pdo->prepare("UPDATE streams SET state = 'removed', name = 'Renamed by the owner' WHERE id = ?")->execute([$id]);

        $this->importer->import($this->handBuiltFile(), 'second', true);

        $row = $this->pdo->query("SELECT state, name FROM streams WHERE id = '{$id}'")->fetch(PDO::FETCH_ASSOC);
        $this->assertSame(['removed', 'Renamed by the owner'], [$row['state'], $row['name']]);
        $this->assertSame([], array_filter($this->store->listed(), static fn (array $r): bool => $r['name'] === 'Renamed by the owner'));
    }

    public function testAnEditedNameSurvivesReimport(): void
    {
        $this->importer->import($this->handBuiltFile(), 'first', true);
        $id = StreamUrl::id('https://b.test/beta.m3u8');
        $this->pdo->prepare("UPDATE streams SET name = 'My own name', groups_json = '[\"Mine\"]', pinned = 1 WHERE id = ?")->execute([$id]);

        $this->importer->import($this->handBuiltFile(), 'second', true);

        $row = $this->pdo->query("SELECT name, groups_json, pinned FROM streams WHERE id = '{$id}'")->fetch(PDO::FETCH_ASSOC);
        $this->assertSame(['My own name', '["Mine"]', 1], [$row['name'], $row['groups_json'], (int) $row['pinned']]);
    }

    public function testDuplicateAddressesInOneFileAreCountedOnce(): void
    {
        $file = "#EXTINF:-1 tvg-id=\"A.us\" tvg-logo=\"\" group-title=\"News\",First\nhttps://x.test/a.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"A.us\" tvg-logo=\"\" group-title=\"News\",Second\nHTTPS://X.test:443/a.m3u8#again\n"
            . "#EXTINF:-1 tvg-id=\"A.us\" tvg-logo=\"\" group-title=\"News\",Third\nhttps://x.test/a.m3u8\n";

        $counts = $this->importer->import($file, 'dup', true);

        $this->assertSame([3, 1, 2], [$counts['entries'], $counts['inserted'], $counts['duplicates']]);
        $this->assertSame('First', $this->pdo->query('SELECT name FROM streams')->fetchColumn(), 'the first spelling wins');
    }

    public function testDryRunWritesNothing(): void
    {
        $counts = $this->importer->import($this->handBuiltFile(), 'dry', false);

        $this->assertEquals($this->expectedFirstImport(), $counts, 'the counts are the same as for a real run');
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn());

        $this->importer->import($this->handBuiltFile(), 'real', true);
        $dryAfter = $this->importer->import($this->handBuiltFile(), 'dry', false);
        $this->assertSame([0, 5], [$dryAfter['inserted'], $dryAfter['already_known']], 'a dry run knows what is already stored');
    }

    public function testHostileNamesAreStoredAsText(): void
    {
        $evil = '<script>alert(1)</script>';
        $longGroup = implode(';', array_fill(0, 12, str_repeat('"\\', 30)));
        $file = "#EXTINF:-1 tvg-id=\"a.us\" tvg-logo=\"javascript:alert(1)\" group-title=\"<img src=x onerror=alert(1)>\",{$evil}\nhttps://x.test/a.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"b.us\" tvg-logo=\"\" group-title=\"{$longGroup}\",Quoted\nhttps://x.test/b.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"c.us\" tvg-logo=\"https://x.test/" . str_repeat('l', 600) . ".png\" group-title=\"News\",LongLogo\nhttps://x.test/c.m3u8\n";

        $counts = $this->importer->import($file, 'hostile', true);

        $this->assertSame(3, $counts['inserted']);
        $a = $this->pdo->query("SELECT name, groups_json, logo_url FROM streams WHERE url = 'https://x.test/a.m3u8'")->fetch(PDO::FETCH_ASSOC);
        $this->assertSame($evil, $a['name']);
        $this->assertSame(['<img src=x onerror=alert(1)>'], json_decode($a['groups_json'], true));
        $this->assertNull($a['logo_url'], 'a logo that is not an http(s) address is not kept');
        $b = $this->pdo->query("SELECT groups_json FROM streams WHERE url = 'https://x.test/b.m3u8'")->fetch(PDO::FETCH_ASSOC);
        $this->assertLessThanOrEqual(400, mb_strlen($b['groups_json']));
        $this->assertIsArray(json_decode($b['groups_json'], true), 'what fits is still valid JSON');
        $c = $this->pdo->query("SELECT logo_url FROM streams WHERE url = 'https://x.test/c.m3u8'")->fetch(PDO::FETCH_ASSOC);
        $this->assertNull($c['logo_url'], 'a logo address too long to store is dropped, the stream is kept');
    }

    public function testASvgLogoAddressIsNotKeptButAPngRenderOfOneIs(): void
    {
        $file = "#EXTINF:-1 tvg-id=\"a.us\" tvg-logo=\"https://logos.test/a.svg\" group-title=\"News\",A\nhttps://x.test/a.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"b.us\" tvg-logo=\"https://logos.test/B.SVG?x=1\" group-title=\"News\",B\nhttps://x.test/b.m3u8\n"
            . "#EXTINF:-1 tvg-id=\"c.us\" tvg-logo=\"https://upload.test/c.svg/512px-c.svg.png\" group-title=\"News\",C\nhttps://x.test/c.m3u8\n";

        $this->importer->import($file, 'svg', true);

        $logos = $this->pdo->query('SELECT name, logo_url FROM streams ORDER BY name')->fetchAll(PDO::FETCH_KEY_PAIR);
        $this->assertSame(['A' => null, 'B' => null, 'C' => 'https://upload.test/c.svg/512px-c.svg.png'], $logos);
    }

    public function testAnEntryWithNoNameGetsOneFromItsIdOrItsHost(): void
    {
        $file = "#EXTINF:-1 tvg-id=\"SomeChannel.us@SD\" tvg-logo=\"\" group-title=\"News\",\nhttps://x.test/a.m3u8\n"
            . "#EXTINF:-1 tvg-logo=\"\" group-title=\"News\",\nhttps://hostname.test/b.m3u8\n";

        $this->importer->import($file, 'names', true);

        $names = $this->pdo->query('SELECT name FROM streams')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertEqualsCanonicalizing(['SomeChannel', 'hostname.test'], $names);
    }

    public function testAPublicIdClashStopsTheImportLoudlyAndLeavesNothingBehind(): void
    {
        // Simulate a 48-bit clash: a stored stream with another key but the public id this entry would get.
        $other = StreamUrl::id('https://other.test/x.m3u8');
        $this->store->insertIfNew([
            'id' => $other, 'public_id' => StreamUrl::publicId(StreamUrl::id('https://k.test/live/manifest.mpd')),
            'url' => 'https://other.test/x.m3u8', 'name' => 'Squatter', 'groups_json' => '["Other"]', 'kind' => 'hls', 'source' => 't',
        ]);

        try {
            $this->importer->import($this->handBuiltFile(), 'clash', true);
            $this->fail('the clash must stop the import');
        } catch (RuntimeException $e) {
            $this->assertSame('public id clash', $e->getMessage());
        }

        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn(), 'the earlier entries of the file were rolled back');
    }

    public function testADryRunAlsoSeesAPublicIdClash(): void
    {
        $this->store->insertIfNew([
            'id' => StreamUrl::id('https://other.test/x.m3u8'), 'public_id' => StreamUrl::publicId(StreamUrl::id('https://k.test/live/manifest.mpd')),
            'url' => 'https://other.test/x.m3u8', 'name' => 'Squatter', 'groups_json' => '["Other"]', 'kind' => 'hls', 'source' => 't',
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('public id clash');
        $this->importer->import($this->handBuiltFile(), 'clash', false);
    }

    public function testSeedDemosPinsFiveAndDefaultsToBigBuckBunny(): void
    {
        $this->assertCount(5, DemoStreams::ALL);

        $this->assertSame(5, $this->importer->seedDemos(true));

        $rows = $this->pdo->query('SELECT name, kind, state, pinned, source, groups_json, is_default, url FROM streams ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
        $this->assertCount(5, $rows);
        foreach ($rows as $r) {
            $this->assertSame(['working', 1, 'demo', '["Demo"]'], [$r['state'], (int) $r['pinned'], $r['source'], $r['groups_json']], $r['name']);
        }
        $this->assertEqualsCanonicalizing(
            ['Apple 4K HEVC', 'Apple HLS Basic', 'Big Buck Bunny', 'Big Buck Bunny DASH', 'Envivio DASH'],
            array_column($rows, 'name'),
        );
        $this->assertSame(['dash', 'dash'], array_column(array_filter($rows, static fn (array $r): bool => str_contains($r['name'], 'DASH')), 'kind'));
        $default = $this->pdo->query('SELECT name, url FROM streams WHERE is_default = 1')->fetchAll(PDO::FETCH_ASSOC);
        $this->assertSame([['name' => 'Big Buck Bunny', 'url' => 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8']], $default);
    }

    public function testSeedingAgainAddsNothingAndKeepsAnOwnersLaterDefault(): void
    {
        $this->importer->seedDemos(true);
        $apple = $this->store->findByPublicId(StreamUrl::publicId(StreamUrl::id('https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8')));
        $this->assertNotNull($apple);
        $this->store->setDefault($apple['public_id']);

        $this->assertSame(0, $this->importer->seedDemos(true));

        $this->assertSame($apple['public_id'], $this->store->defaultPublicId());
    }

    public function testSeedingDryRunWritesNothingButCounts(): void
    {
        $this->assertSame(5, $this->importer->seedDemos(false));
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn());
    }

    public function testADemoAddressAlreadyInTheFileStaysPinnedWhenDemosAreSeededFirst(): void
    {
        $this->importer->seedDemos(true);
        $file = "#EXTINF:-1 tvg-id=\"BBB.us\" tvg-logo=\"\" group-title=\"Movies\",BBB from the list\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n";

        $counts = $this->importer->import($file, 'list', true);

        $this->assertSame([0, 1], [$counts['inserted'], $counts['already_known']]);
        $row = $this->pdo->query("SELECT name, pinned, state FROM streams WHERE url = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'")->fetch(PDO::FETCH_ASSOC);
        $this->assertSame(['Big Buck Bunny', 1, 'working'], [$row['name'], (int) $row['pinned'], $row['state']]);
    }
}
