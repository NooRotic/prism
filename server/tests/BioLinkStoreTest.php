<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\Fixtures;

final class BioLinkStoreTest extends DbTestCase
{
    private BioLinkStore $links;
    private ChannelStore $channels;

    protected function setUp(): void
    {
        parent::setUp();
        $this->links = new BioLinkStore($this->pdo, $this->clock);
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
    }

    private const YT = ['platform' => 'youtube', 'url' => 'https://www.youtube.com/@alice'];
    private const KICK = ['platform' => 'kick', 'url' => 'https://kick.com/alice'];

    /** A later profile refresh: the channel is re-read first, then its links are synced. */
    private function refreshLater(array $links): void
    {
        $this->clock->advanceMs(3_600_000);
        $this->channels->applyProfile('1', Fixtures::user('1', 'alice'), null);
        $this->links->sync('1', $links);
    }

    public function testSyncAddsLinksAndTheyAreCurrent(): void
    {
        $this->links->sync('1', [self::YT, self::KICK]);

        $this->assertSame([self::YT, self::KICK], $this->links->current('1'));
    }

    public function testSyncTwiceWithTheSameLinksCreatesNoDuplicatesAndBumpsLastSeen(): void
    {
        $this->links->sync('1', [self::YT]);
        $this->refreshLater([self::YT]);

        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM bio_links')->fetchColumn());
        $row = $this->pdo->query('SELECT first_seen_at, last_seen_at FROM bio_links')->fetch();
        $this->assertSame('2026-11-12 03:00:00', $row['first_seen_at']);
        $this->assertSame('2026-11-12 04:00:00', $row['last_seen_at']);
        $this->assertSame([self::YT], $this->links->current('1'));
    }

    public function testARemovedLinkIsNotCurrentButIsKept(): void
    {
        $this->links->sync('1', [self::YT, self::KICK]);
        $this->refreshLater([self::YT]);

        $this->assertSame([self::YT], $this->links->current('1'));
        $this->assertSame('2', (string) $this->pdo->query('SELECT COUNT(*) FROM bio_links')->fetchColumn());
    }

    public function testRemovingEveryLinkLeavesNoCurrentLinks(): void
    {
        $this->links->sync('1', [self::YT]);
        $this->refreshLater([]);

        $this->assertSame([], $this->links->current('1'));
    }

    public function testAChannelThatWasNeverSyncedHasNoLinks(): void
    {
        $this->assertSame([], $this->links->current('1'));
        $this->assertSame([], $this->links->current('999'));
    }
}
