<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use InvalidArgumentException;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use RuntimeException;

final class StreamStoreTest extends DbTestCase
{
    private StreamStore $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
    }

    /** @param array<string,mixed> $extra @return array<string,mixed> */
    private function row(string $n, array $extra = []): array
    {
        $url = 'https://host' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);

        return array_merge([
            'id' => $id,
            'public_id' => StreamUrl::publicId($id),
            'url' => $url,
            'name' => 'Stream ' . $n,
            'groups_json' => '["News"]',
            'kind' => 'hls',
            'state' => 'new',
            'source' => 'test',
            'added_at' => '2026-11-12 03:00:00',
        ], $extra);
    }

    public function testInsertIfNewIsIdempotent(): void
    {
        $row = $this->row('1');

        $this->assertTrue($this->store->insertIfNew($row));
        $this->assertFalse($this->store->insertIfNew(array_merge($row, ['name' => 'A different name'])));

        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn());
        $this->assertSame('Stream 1', $this->store->findByPublicId($row['public_id'])['name'] ?? null);
    }

    public function testInsertIfNewFillsTheDefaultsAndTheClock(): void
    {
        $row = $this->row('1');
        unset($row['added_at']);
        $this->store->insertIfNew($row);

        $found = $this->store->findByPublicId($row['public_id']);

        $this->assertNotNull($found);
        $this->assertSame('2026-11-12 03:00:00', $found['added_at']);
        $this->assertSame(['new', 0, 0, 0, null, null], [$found['state'], $found['pinned'], $found['is_default'], $found['logo_tries'], $found['country'], $found['logo_file']]);
    }

    public function testPublicIdClashThrows(): void
    {
        $this->store->insertIfNew($this->row('1'));
        $clash = $this->row('2', ['public_id' => $this->row('1')['public_id']]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('public id clash');
        $this->store->insertIfNew($clash);
    }

    public function testAnUnknownColumnIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->store->insertIfNew($this->row('1', ['no_such_column' => 'x']));
    }

    public function testFindByPublicIdAnswersNullForAnUnknownId(): void
    {
        $this->assertNull($this->store->findByPublicId('000000000000'));
    }

    public function testListedExcludesUnlistedStatesAndOrdersPinnedFirst(): void
    {
        $this->store->insertIfNew($this->row('1', ['name' => 'banana']));
        $this->store->insertIfNew($this->row('2', ['name' => 'Apple', 'state' => 'working']));
        $this->store->insertIfNew($this->row('3', ['name' => 'cherry', 'state' => 'suspect']));
        $this->store->insertIfNew($this->row('4', ['name' => 'zebra', 'pinned' => 1, 'state' => 'working']));
        $this->store->insertIfNew($this->row('5', ['name' => 'Yak', 'pinned' => 1]));
        foreach (['dead', 'removed', 'unplayable', 'held'] as $i => $state) {
            $this->store->insertIfNew($this->row('x' . $i, ['name' => 'hidden ' . $state, 'state' => $state]));
        }

        $names = array_map(static fn (array $r): string => $r['name'], $this->store->listed());

        $this->assertSame(['Yak', 'zebra', 'Apple', 'banana', 'cherry'], $names, 'pinned first, then by name ignoring case');
    }

    public function testListedRowsCarryTheFieldsTheSnapshotNeeds(): void
    {
        $this->store->insertIfNew($this->row('1', ['country' => 'us', 'pinned' => 1, 'is_default' => 1, 'logo_file' => 'abcdef012345.png']));

        $r = $this->store->listed()[0];

        foreach (['public_id', 'url', 'name', 'groups_json', 'country', 'kind', 'state', 'pinned', 'is_default', 'logo_file'] as $key) {
            $this->assertArrayHasKey($key, $r);
        }
        $this->assertSame([1, 1, 'us', 'abcdef012345.png'], [$r['pinned'], $r['is_default'], $r['country'], $r['logo_file']]);
    }

    public function testCountsByState(): void
    {
        $this->store->insertIfNew($this->row('1'));
        $this->store->insertIfNew($this->row('2'));
        $this->store->insertIfNew($this->row('3', ['state' => 'held']));

        $this->assertSame(['new' => 2, 'held' => 1], $this->store->countsByState());
    }

    public function testSetDefaultKeepsExactlyOne(): void
    {
        $a = $this->row('1', ['state' => 'working']);
        $b = $this->row('2');
        $gone = $this->row('3', ['state' => 'removed']);
        foreach ([$a, $b, $gone] as $r) {
            $this->store->insertIfNew($r);
        }

        $this->assertTrue($this->store->setDefault($a['public_id']));
        $this->assertSame($a['public_id'], $this->store->defaultPublicId());
        $this->assertTrue($this->store->setDefault($b['public_id']));
        $this->assertSame($b['public_id'], $this->store->defaultPublicId());
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM streams WHERE is_default = 1')->fetchColumn());

        $this->assertFalse($this->store->setDefault('000000000000'), 'an unknown stream cannot be the default');
        $this->assertFalse($this->store->setDefault($gone['public_id']), 'a stream nobody can see cannot be the default');
        $this->assertSame($b['public_id'], $this->store->defaultPublicId(), 'a refused change leaves the old default alone');
    }

    public function testNoDefaultMeansNull(): void
    {
        $this->assertNull($this->store->defaultPublicId());
    }

    public function testSetDefaultWorksInsideACallersTransaction(): void
    {
        $a = $this->row('1');
        $this->store->insertIfNew($a);

        $this->pdo->beginTransaction();
        $this->assertTrue($this->store->setDefault($a['public_id']));
        $this->pdo->rollBack();

        $this->assertNull($this->store->defaultPublicId(), 'the caller owns the transaction, so its rollback undoes the change');
    }

    public function testTransactionRollsBackWhenTheCallbackThrows(): void
    {
        try {
            $this->store->transaction(function (): void {
                $this->store->insertIfNew($this->row('1'));
                throw new RuntimeException('boom');
            });
            $this->fail('the exception must come out');
        } catch (RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }

        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn());
        $this->assertFalse($this->pdo->inTransaction());
    }

    public function testLogoQueueSkipsDoneAndExhaustedRows(): void
    {
        $this->store->insertIfNew($this->row('1', ['logo_url' => 'https://logos.test/1.png']));
        $this->store->insertIfNew($this->row('2', ['logo_url' => 'https://logos.test/2.png', 'logo_file' => 'abcdef012345.png']));
        $this->store->insertIfNew($this->row('3', ['logo_url' => 'https://logos.test/3.png', 'logo_tries' => 3]));
        $this->store->insertIfNew($this->row('4'));
        $this->store->insertIfNew($this->row('5', ['logo_url' => 'https://logos.test/5.png', 'logo_tries' => 2, 'state' => 'working']));
        $this->store->insertIfNew($this->row('6', ['logo_url' => 'https://logos.test/6.png', 'state' => 'held']));

        $queue = $this->store->withLogoToFetch(10);

        $this->assertEqualsCanonicalizing(['Stream 1', 'Stream 5'], array_map(static fn (array $r): string => $r['name'], $queue));
        $this->assertCount(1, $this->store->withLogoToFetch(1));
        $this->assertSame([], $this->store->withLogoToFetch(0));
    }

    public function testRecordLogoStoresAFileOrAddsATry(): void
    {
        $row = $this->row('1', ['logo_url' => 'https://logos.test/1.png']);
        $this->store->insertIfNew($row);

        $this->store->recordLogo($row['id'], null);
        $this->store->recordLogo($row['id'], null);
        $this->assertSame(2, $this->store->findByPublicId($row['public_id'])['logo_tries'] ?? null);
        $this->assertCount(1, $this->store->withLogoToFetch(10));

        $this->store->recordLogo($row['id'], $row['public_id'] . '.png');
        $this->assertSame($row['public_id'] . '.png', $this->store->findByPublicId($row['public_id'])['logo_file'] ?? null);
        $this->assertSame([], $this->store->withLogoToFetch(10));
    }

    public function testRecordLogoRefusesAFileNameThatIsNotOurOwnShape(): void
    {
        $row = $this->row('1', ['logo_url' => 'https://logos.test/1.png']);
        $this->store->insertIfNew($row);

        foreach (['../evil.png', 'abcdef012345.svg', 'ABCDEF012345.png', 'abcdef012345', 'abcdef012345.png/x'] as $file) {
            try {
                $this->store->recordLogo($row['id'], $file);
                $this->fail('refused: ' . $file);
            } catch (InvalidArgumentException) {
                $found = $this->store->findByPublicId($row['public_id']);
                $this->assertNotNull($found);
                $this->assertNull($found['logo_file']);
            }
        }
    }

    public function testExistsById(): void
    {
        $row = $this->row('1');
        $this->assertFalse($this->store->exists($row['id']));
        $this->store->insertIfNew($row);
        $this->assertTrue($this->store->exists($row['id']));
    }

    public function testRowsComeBackWithPhpTypes(): void
    {
        $this->store->insertIfNew($this->row('1', ['pinned' => 1]));

        $r = $this->store->listed()[0];

        $this->assertIsInt($r['pinned']);
        $this->assertIsInt($r['is_default']);
    }
}
