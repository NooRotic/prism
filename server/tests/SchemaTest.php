<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use PDOException;
use Prism\History\Tests\Support\DbTestCase;

final class SchemaTest extends DbTestCase
{
    private function channel(string $id, string $login, string $status = 'tracking'): void
    {
        $this->pdo->prepare(
            'INSERT INTO channels (twitch_id, login, first_seen_at, last_visited_at, tracked_since, status)
             VALUES (?, ?, ?, ?, ?, ?)',
        )->execute([$id, $login, '2026-11-12 03:00:00', '2026-11-12 03:00:00', '2026-11-12', $status]);
    }

    private function snapshot(string $id, string $date): void
    {
        $this->pdo->prepare(
            'INSERT INTO snapshots (twitch_id, snap_date, tt_status, fetched_at) VALUES (?, ?, ?, ?)',
        )->execute([$id, $date, 'ok', '2026-11-12 03:00:00']);
    }

    private function link(string $id, string $platform, string $url): void
    {
        $this->pdo->prepare(
            'INSERT INTO bio_links (twitch_id, platform, url, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
        )->execute([$id, $platform, $url, '2026-11-12 03:00:00', '2026-11-12 03:00:00']);
    }

    public function testSnapshotKeyIsIdAndDate(): void
    {
        $this->channel('1', 'alice');
        $this->snapshot('1', '2026-11-12');
        $this->snapshot('1', '2026-11-13');

        $this->expectException(PDOException::class);
        $this->snapshot('1', '2026-11-12');
    }

    public function testLoginIsNotUnique(): void
    {
        $this->channel('1', 'alice');
        $this->channel('2', 'alice');

        $this->assertSame('2', (string) $this->pdo->query("SELECT COUNT(*) FROM channels WHERE login = 'alice'")->fetchColumn());
    }

    public function testStatusRejectsUnknownValue(): void
    {
        $this->expectException(PDOException::class);
        $this->channel('1', 'alice', 'bogus');
    }

    public function testBioLinkUniquePerChannelPlatformUrl(): void
    {
        $this->channel('1', 'alice');
        $this->link('1', 'youtube', 'https://www.youtube.com/@alice');
        $this->link('1', 'youtube', 'https://www.youtube.com/@alice2');
        $this->link('1', 'kick', 'https://kick.com/alice');

        $this->expectException(PDOException::class);
        $this->link('1', 'youtube', 'https://www.youtube.com/@alice');
    }

    public function testTtGateRowIsSeeded(): void
    {
        $this->assertSame('0', (string) $this->pdo->query('SELECT last_call_ms FROM tt_gate WHERE id = 1')->fetchColumn());
    }

    public function testSnapshotsNeedAnExistingChannel(): void
    {
        $this->expectException(PDOException::class);
        $this->snapshot('999', '2026-11-12');
    }

    public function testDeletingAChannelRemovesItsSnapshotsAndLinks(): void
    {
        $this->channel('1', 'alice');
        $this->snapshot('1', '2026-11-12');
        $this->link('1', 'kick', 'https://kick.com/alice');

        $this->pdo->exec("DELETE FROM channels WHERE twitch_id = '1'");

        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn());
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM bio_links')->fetchColumn());
    }

    public function testSnapshotNumbersKeepTheirSignAndSize(): void
    {
        $this->channel('1', 'alice');
        $this->pdo->prepare(
            'INSERT INTO snapshots (twitch_id, snap_date, followers_change, followers_total, hours_watched, max_viewers, tt_status, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute(['1', '2026-11-12', -3745, 11292376, 5000000000, null, 'ok', '2026-11-12 03:00:00']);

        $row = $this->pdo->query('SELECT followers_change, followers_total, hours_watched, max_viewers FROM snapshots')->fetch(PDO::FETCH_ASSOC);

        $this->assertSame(-3745, (int) $row['followers_change']);
        $this->assertSame(11292376, (int) $row['followers_total']);
        $this->assertSame(5000000000, (int) $row['hours_watched']);
        $this->assertNull($row['max_viewers']);
    }
}
