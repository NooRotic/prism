<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\Fixtures;

final class ChannelStoreTest extends DbTestCase
{
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;

    private ChannelStore $channels;
    private SnapshotStore $snapshots;

    protected function setUp(): void
    {
        parent::setUp();
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
    }

    /** @return array<string,mixed> */
    private function row(string $id): array
    {
        return $this->pdo->query("SELECT * FROM channels WHERE twitch_id = '{$id}'")->fetch(PDO::FETCH_ASSOC);
    }

    public function testInsertTrackedSetsTrackedSinceToday(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice', ['broadcasterType' => 'affiliate']), Fixtures::info('1'));

        $row = $this->row('1');
        $this->assertSame('alice', $row['login']);
        $this->assertSame('Alice', $row['display_name']);
        $this->assertSame('affiliate', $row['broadcaster_type']);
        $this->assertSame('en', $row['language']);
        $this->assertSame('Just Chatting', $row['category']);
        $this->assertSame('2016-12-14 20:32:28', $row['account_created_at']);
        $this->assertSame('2026-11-12 03:00:00', $row['first_seen_at']);
        $this->assertSame('2026-11-12 03:00:00', $row['last_visited_at']);
        $this->assertSame('2026-11-12', $row['tracked_since']);
        $this->assertSame('tracking', $row['status']);
        $this->assertSame('2026-11-12 03:00:00', $row['profile_checked_at']);
    }

    public function testInsertTrackedTwiceIsSafe(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->channels->insertTracked(Fixtures::user('1', 'alice', ['displayName' => 'Second']), null);

        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM channels')->fetchColumn());
        $this->assertSame('Alice', $this->row('1')['display_name']);
    }

    public function testInsertTrackedWithoutChannelInfoLeavesLanguageAndCategoryNull(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);

        $this->assertNull($this->row('1')['language']);
        $this->assertNull($this->row('1')['category']);
    }

    public function testLongTextIsTruncatedToTheColumnsAndAnOversizedAvatarIsDropped(): void
    {
        $this->channels->insertTracked(
            Fixtures::user('1', 'alice', ['displayName' => str_repeat('n', 80), 'avatarUrl' => 'https://img.example/' . str_repeat('a', 400)]),
            Fixtures::info('1', 'english-extra', str_repeat('c', 150)),
        );

        $row = $this->row('1');
        $this->assertSame(50, mb_strlen($row['display_name']));
        $this->assertSame(100, mb_strlen($row['category']));
        $this->assertSame(8, mb_strlen($row['language']));
        $this->assertNull($row['avatar_url']);
    }

    public function testFindByIdAndFindByLoginReturnTheRowOrNull(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);

        $this->assertSame('1', $this->channels->findById('1')['twitch_id']);
        $this->assertSame('1', $this->channels->findByLogin('alice')['twitch_id']);
        $this->assertNull($this->channels->findById('999'));
        $this->assertNull($this->channels->findByLogin('nobody'));
    }

    public function testFindByLoginPrefersTheMostRecentlyVisitedRow(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->clock->advanceMs(2 * self::HOUR_MS);
        $this->channels->insertTracked(Fixtures::user('2', 'alice'), null);

        $this->assertSame('2', $this->channels->findByLogin('alice')['twitch_id']);
    }

    public function testApplyProfileRenamesTheLogin(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), Fixtures::info('1'));
        $this->clock->advanceMs(self::HOUR_MS);

        $this->channels->applyProfile('1', Fixtures::user('1', 'alice_new', ['displayName' => 'Alice New', 'broadcasterType' => 'partner']), Fixtures::info('1', 'de', 'Chess'));

        $row = $this->row('1');
        $this->assertSame('alice_new', $row['login']);
        $this->assertSame('Alice New', $row['display_name']);
        $this->assertSame('de', $row['language']);
        $this->assertSame('Chess', $row['category']);
        $this->assertSame('2026-11-12 04:00:00', $row['profile_checked_at']);
    }

    public function testApplyProfileKeepsLanguageAndCategoryWhenThereIsNoChannelInfo(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), Fixtures::info('1', 'en', 'Just Chatting'));

        $this->channels->applyProfile('1', Fixtures::user('1', 'alice'), null);

        $this->assertSame('en', $this->row('1')['language']);
        $this->assertSame('Just Chatting', $this->row('1')['category']);
    }

    public function testApplyProfileRevivesAGoneChannel(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->channels->markGone('1');
        $this->assertSame('gone', $this->row('1')['status']);

        $this->channels->applyProfile('1', Fixtures::user('1', 'alice'), null);

        $this->assertSame('tracking', $this->row('1')['status']);
    }

    public function testApplyProfileDoesNotWakeADormantChannel(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->pdo->exec("UPDATE channels SET status = 'dormant'");

        $this->channels->applyProfile('1', Fixtures::user('1', 'alice'), null);

        $this->assertSame('dormant', $this->row('1')['status']);
    }

    public function testTouchVisitWritesAtMostOncePerHour(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);

        $this->clock->advanceMs(30 * 60_000);
        $this->channels->touchVisit('1');
        $this->assertSame('2026-11-12 03:00:00', $this->row('1')['last_visited_at']);

        $this->clock->advanceMs(31 * 60_000);
        $this->channels->touchVisit('1');
        $this->assertSame('2026-11-12 04:01:00', $this->row('1')['last_visited_at']);
    }

    public function testTouchVisitWakesADormantChannelAtOnce(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->pdo->exec("UPDATE channels SET status = 'dormant'");
        $this->clock->advanceMs(60_000);

        $this->channels->touchVisit('1');

        $this->assertSame('tracking', $this->row('1')['status']);
        $this->assertSame('2026-11-12 03:01:00', $this->row('1')['last_visited_at']);
    }

    public function testTouchVisitDoesNotReviveAGoneChannel(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->channels->markGone('1');
        $this->clock->advanceMs(2 * self::HOUR_MS);

        $this->channels->touchVisit('1');

        $this->assertSame('gone', $this->row('1')['status']);
    }

    public function testMarkDormantOlderThanTailDays(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'old'), null);
        $this->channels->insertTracked(Fixtures::user('2', 'recent'), null);
        $this->pdo->exec("UPDATE channels SET last_visited_at = '2026-10-12 03:00:00' WHERE twitch_id = '1'");
        $this->pdo->exec("UPDATE channels SET last_visited_at = '2026-10-14 03:00:00' WHERE twitch_id = '2'");

        $count = $this->channels->markDormantOlderThan(30);

        $this->assertSame(1, $count);
        $this->assertSame('dormant', $this->row('1')['status']);
        $this->assertSame('tracking', $this->row('2')['status']);
    }

    public function testCountNewSinceCountsFirstSeen(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'a'), null);
        $this->pdo->exec("UPDATE channels SET first_seen_at = '2026-11-11 21:00:00' WHERE twitch_id = '1'");
        $this->channels->insertTracked(Fixtures::user('2', 'b'), null);
        $this->pdo->exec("UPDATE channels SET first_seen_at = '2026-11-12 02:30:00' WHERE twitch_id = '2'");
        $this->channels->insertTracked(Fixtures::user('3', 'c'), null);

        $this->assertSame(1, $this->channels->countNewSince('2026-11-12 03:00:00'));
        $this->assertSame(2, $this->channels->countNewSince('2026-11-12 02:00:00'));
        $this->assertSame(3, $this->channels->countNewSince('2026-11-11 00:00:00'));
    }

    public function testBlockedByIdAndByLogin(): void
    {
        $this->assertFalse($this->channels->isBlockedId('1'));

        $this->channels->block('1', 'alice');

        $this->assertTrue($this->channels->isBlockedId('1'));
        $this->assertTrue($this->channels->isBlockedLogin('alice'));
        $this->assertTrue($this->channels->isBlockedLogin('ALICE'));
        $this->assertFalse($this->channels->isBlockedLogin('bob'));
        $this->assertFalse($this->channels->isBlockedId('2'));
    }

    public function testRemoveDeletesChannelSnapshotsAndLinks(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');
        (new BioLinkStore($this->pdo, $this->clock))->sync('1', [['platform' => 'kick', 'url' => 'https://kick.com/alice']]);

        $this->channels->remove('1');

        foreach (['channels', 'snapshots', 'bio_links'] as $table) {
            $this->assertSame('0', (string) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn(), $table);
        }
    }

    public function testTrackingWithoutOkSnapshotExcludesDormantGoneAndOkToday(): void
    {
        foreach (['1' => 'none', '2' => 'okToday', '3' => 'errorToday', '4' => 'dormant', '5' => 'gone'] as $id => $login) {
            $this->channels->insertTracked(Fixtures::user((string) $id, $login), null);
        }
        $this->snapshots->upsert('2', '2026-11-12', Fixtures::summary(), 'ok');
        $this->snapshots->upsert('3', '2026-11-12', [], 'error');
        $this->pdo->exec("UPDATE channels SET status = 'dormant' WHERE twitch_id = '4'");
        $this->channels->markGone('5');

        $ids = array_column($this->channels->trackingWithoutOkSnapshotFor('2026-11-12'), 'twitch_id');
        sort($ids);

        $this->assertSame(['1', '3'], $ids);
    }

    public function testAnOkSnapshotOnAnotherDateDoesNotCountForToday(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');

        $this->assertCount(1, $this->channels->trackingWithoutOkSnapshotFor('2026-11-12'));
    }

    public function testOrdersNeverFetchedFirstThenOldest(): void
    {
        foreach (['A' => 'neverfetched', 'B' => 'fetchedyesterday', 'C' => 'fetchedlongago'] as $id => $login) {
            $this->channels->insertTracked(Fixtures::user($id, $login), null);
        }
        $now = $this->clock->nowMs();
        $this->clock->set($now - self::DAY_MS);
        $this->snapshots->upsert('B', '2026-11-11', [], 'error');
        $this->clock->set($now - 3 * self::DAY_MS);
        $this->snapshots->upsert('C', '2026-11-09', [], 'error');
        $this->clock->set($now);

        $ids = array_column($this->channels->trackingWithoutOkSnapshotFor('2026-11-12'), 'twitch_id');

        $this->assertSame(['A', 'C', 'B'], $ids);
    }
}
