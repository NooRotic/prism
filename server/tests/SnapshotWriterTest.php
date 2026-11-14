<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Throwable;

final class SnapshotWriterTest extends DbTestCase
{
    private StreamStore $store;
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->dir = sys_get_temp_dir() . '/prism-snap-' . bin2hex(random_bytes(6)) . '/data';
    }

    protected function tearDown(): void
    {
        $root = dirname($this->dir);
        foreach (glob($this->dir . '/{,.}*', GLOB_BRACE) ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        if (is_dir($this->dir)) {
            rmdir($this->dir);
        }
        if (is_dir($root)) {
            rmdir($root);
        }
    }

    private function writer(): SnapshotWriter
    {
        return new SnapshotWriter($this->store, $this->clock, $this->dir);
    }

    /** @param array<string,mixed> $extra */
    private function add(string $n, string $name, array $extra = []): string
    {
        $url = 'https://host' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        $this->store->insertIfNew(array_merge([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => $name,
            'groups_json' => '["News"]', 'kind' => 'hls', 'state' => 'new', 'source' => 'test',
        ], $extra));

        return StreamUrl::publicId($id);
    }

    /** @return array<string,mixed> */
    private function snapshot(): array
    {
        $decoded = json_decode((string) file_get_contents($this->dir . '/streams.json'), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($decoded);

        return $decoded;
    }

    public function testShapeMatchesTheContract(): void
    {
        $id = $this->add('1', 'Alpha', ['country' => 'us', 'logo_file' => 'abcdef012345.png', 'pinned' => 1, 'state' => 'working', 'is_default' => 1, 'groups_json' => '["News","General"]']);
        $this->add('2', 'Beta', ['kind' => 'dash']);

        $result = $this->writer()->write();
        $s = $this->snapshot();

        $this->assertSame(['v', 'generated', 'default', 'groups', 'streams'], array_keys($s));
        $this->assertSame(1, $s['v']);
        $this->assertSame('2026-11-12T03:00:00Z', $s['generated']);
        $this->assertSame($id, $s['default']);
        $this->assertCount(2, $s['streams']);
        $this->assertSame(
            ['i' => $id, 'n' => 'Alpha', 'g' => [0, 1], 'c' => 'us', 'l' => 'abcdef012345.png', 'k' => 'hls', 'p' => 1, 's' => 'working', 'u' => 'https://host1.test/live.m3u8'],
            $s['streams'][0],
        );
        $this->assertSame(['i', 'n', 'g', 'c', 'l', 'k', 'p', 's', 'u'], array_keys($s['streams'][1]));
        $this->assertSame([null, null, 'dash', 0, 'new'], [$s['streams'][1]['c'], $s['streams'][1]['l'], $s['streams'][1]['k'], $s['streams'][1]['p'], $s['streams'][1]['s']]);
        $this->assertSame(2, $result['streams']);
        $this->assertSame(filesize($this->dir . '/streams.json'), $result['bytes']);
        $this->assertSame(filesize($this->dir . '/streams.json.gz'), $result['gzipped']);
    }

    public function testOnlyListedStatesAreIncluded(): void
    {
        $this->add('1', 'new one');
        $this->add('2', 'working one', ['state' => 'working']);
        $this->add('3', 'suspect one', ['state' => 'suspect']);
        foreach (['held', 'unplayable', 'dead', 'removed'] as $i => $state) {
            $this->add('x' . $i, 'hidden ' . $state, ['state' => $state]);
        }

        $this->assertSame(3, $this->writer()->write()['streams']);

        $names = array_column($this->snapshot()['streams'], 'n');
        $this->assertEqualsCanonicalizing(['new one', 'working one', 'suspect one'], $names);
        $this->assertSame([], array_diff(array_column($this->snapshot()['streams'], 's'), ['new', 'working', 'suspect']));
    }

    public function testPinnedFirstThenNameIgnoringCase(): void
    {
        $this->add('1', 'banana');
        $this->add('2', 'Apple');
        $this->add('3', 'zebra', ['pinned' => 1]);
        $this->add('4', 'cherry');

        $this->writer()->write();

        $this->assertSame(['zebra', 'Apple', 'banana', 'cherry'], array_column($this->snapshot()['streams'], 'n'));
    }

    public function testGroupIndexesPointAtTheRightNames(): void
    {
        $this->add('1', 'A', ['groups_json' => '["News","Sports"]']);
        $this->add('2', 'B', ['groups_json' => '["Sports"]']);
        $this->add('3', 'C', ['groups_json' => '["Sports","Zoo","Art"]']);
        $this->add('4', 'D', ['groups_json' => '["News"]']);

        $this->writer()->write();
        $s = $this->snapshot();

        // Sports 3, News 2, then the two single ones by name: Art, Zoo.
        $this->assertSame(['Sports', 'News', 'Art', 'Zoo'], $s['groups']);
        $byName = [];
        foreach ($s['streams'] as $stream) {
            $byName[$stream['n']] = array_map(static fn (int $i): string => $s['groups'][$i], $stream['g']);
        }
        $this->assertSame(['A' => ['News', 'Sports'], 'B' => ['Sports'], 'C' => ['Sports', 'Zoo', 'Art'], 'D' => ['News']], $byName);
    }

    public function testAGroupNamedLikeANumberStaysText(): void
    {
        $this->add('1', 'A', ['groups_json' => '["2024","News"]']);
        $this->add('2', 'B', ['groups_json' => '["2024"]']);

        $this->writer()->write();
        $s = $this->snapshot();

        $this->assertSame(['2024', 'News'], $s['groups']);
        $this->assertSame([[0, 1], [0]], array_column($s['streams'], 'g'));
    }

    public function testAnUnreadableGroupListBecomesOther(): void
    {
        $this->add('1', 'A', ['groups_json' => 'not json']);
        $this->add('2', 'B', ['groups_json' => '{"a":1}']);
        $this->add('3', 'C', ['groups_json' => '[]']);

        $this->writer()->write();
        $s = $this->snapshot();

        $this->assertSame(['Other'], $s['groups']);
        foreach ($s['streams'] as $stream) {
            $this->assertSame([0], $stream['g']);
        }
    }

    public function testNoTemporaryFileIsLeftBehind(): void
    {
        $this->add('1', 'A');

        $this->writer()->write();
        $this->writer()->write();

        $files = array_values(array_diff(scandir($this->dir) ?: [], ['.', '..']));
        sort($files);
        $this->assertSame(['streams.json', 'streams.json.gz'], $files);
    }

    public function testTheGzipFileInflatesToTheSameJson(): void
    {
        $this->add('1', 'A');
        $this->add('2', 'B', ['state' => 'working']);

        $this->writer()->write();

        $this->assertSame(
            file_get_contents($this->dir . '/streams.json'),
            gzdecode((string) file_get_contents($this->dir . '/streams.json.gz')),
        );
    }

    public function testAnEmptyStoreWritesAnEmptyValidSnapshot(): void
    {
        $result = $this->writer()->write();

        $this->assertSame(0, $result['streams']);
        $this->assertSame(
            ['v' => 1, 'generated' => '2026-11-12T03:00:00Z', 'default' => null, 'groups' => [], 'streams' => []],
            $this->snapshot(),
        );
    }

    public function testNamesWithQuotesAndUnicodeSurviveEncoding(): void
    {
        $names = ['He said "hi" \\ / done', 'Télévision française — 日本語 🎬', '<script>alert(1)</script>', "tab\tand\u{2028}separator"];
        foreach ($names as $i => $name) {
            $this->add((string) $i, $name);
        }

        $this->writer()->write();

        $this->assertEqualsCanonicalizing($names, array_column($this->snapshot()['streams'], 'n'));
    }

    public function testTheDataFolderIsCreatedPrivate(): void
    {
        $this->assertDirectoryDoesNotExist($this->dir);

        $this->writer()->write();

        $this->assertDirectoryExists($this->dir);
        $this->assertSame('0750', substr(sprintf('%o', fileperms($this->dir)), -4));
    }

    public function testDefaultIsNullWithoutOneAndWhenItsStreamIsNoLongerListed(): void
    {
        $id = $this->add('1', 'A', ['is_default' => 1]);
        $this->writer()->write();
        $this->assertSame($id, $this->snapshot()['default']);

        $this->pdo->exec("UPDATE streams SET state = 'removed'");
        $this->writer()->write();
        $this->assertNull($this->snapshot()['default'], 'a default nobody can see is not advertised');
    }

    public function testAFailedWriteLeavesThePreviousSnapshotIntact(): void
    {
        $this->add('1', 'A');
        $this->writer()->write();
        $before = (string) file_get_contents($this->dir . '/streams.json');

        $this->pdo->exec('DROP TABLE streams');
        try {
            $this->writer()->write();
            $this->fail('the write must fail');
        } catch (Throwable) {
            // expected
        }

        $this->assertSame($before, (string) file_get_contents($this->dir . '/streams.json'));
        $this->assertSame(['streams.json', 'streams.json.gz'], array_values(array_diff(scandir($this->dir) ?: [], ['.', '..'])));
    }

    public function testPathIsTheJsonFile(): void
    {
        $this->assertSame($this->dir . '/streams.json', $this->writer()->path());
    }
}
