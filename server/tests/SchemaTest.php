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

    public function testEverySnapshotNumberHoldsAnyValueTtCouldPlausiblySend(): void
    {
        $this->channel('1', 'alice');
        $huge = 9_000_000_000;
        $this->pdo->prepare(
            'INSERT INTO snapshots (twitch_id, snap_date, tt_rank, minutes_streamed, avg_viewers, max_viewers, hours_watched, followers_change, followers_total, tt_status, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute(['1', '2026-11-12', $huge, $huge, $huge, $huge, $huge, -$huge, $huge, 'ok', '2026-11-12 03:00:00']);

        $row = $this->pdo->query('SELECT tt_rank, minutes_streamed, avg_viewers, max_viewers, followers_change FROM snapshots')->fetch(PDO::FETCH_ASSOC);

        $this->assertSame([$huge, $huge, $huge, $huge, -$huge], array_map('intval', array_values($row)));
    }

    public function testTheFirstMigrationCanBeRunAgainAfterAPartialFailure(): void
    {
        $this->channel('1', 'alice');
        $this->snapshot('1', '2026-11-12');
        $this->pdo->exec("DELETE FROM schema_migrations WHERE version = '001_schema'");

        $applied = (new \Prism\History\Migrator($this->pdo, __DIR__ . '/../migrations'))->run();

        $this->assertSame(['001_schema'], $applied);
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM tt_gate')->fetchColumn());
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn());
    }

    public function testAdminTablesExist(): void
    {
        $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

        foreach (['usage_counters', 'admin_attempts', 'admin_audit', 'admin_token_cache'] as $table) {
            $this->assertContains($table, $tables);
        }
    }

    public function testUsageCounterKeyIsDayAndName(): void
    {
        $insert = $this->pdo->prepare('INSERT INTO usage_counters (day_utc, k, n) VALUES (?, ?, 1)');
        $insert->execute(['2026-11-12', 'hit:home']);
        $insert->execute(['2026-11-13', 'hit:home']);
        $insert->execute(['2026-11-12', 'hit:twitch']);

        $this->expectException(PDOException::class);
        $insert->execute(['2026-11-12', 'hit:home']);
    }

    public function testAttemptsAreOneRowPerTwitchUser(): void
    {
        $insert = $this->pdo->prepare(
            'INSERT INTO admin_attempts (twitch_id, login, first_attempt_at, last_attempt_at) VALUES (?, ?, ?, ?)',
        );
        $insert->execute(['7', 'someone', '2026-11-12 03:00:00', '2026-11-12 03:00:00']);
        $row = $this->pdo->query('SELECT attempts, via_script FROM admin_attempts')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame([1, 0], [(int) $row['attempts'], (int) $row['via_script']]);

        $this->expectException(PDOException::class);
        $insert->execute(['7', 'someone', '2026-11-12 04:00:00', '2026-11-12 04:00:00']);
    }

    public function testSecondMigrationCanBeRunAgain(): void
    {
        $this->pdo->exec("INSERT INTO usage_counters (day_utc, k, n) VALUES ('2026-11-12', 'hit:home', 4)");
        $this->pdo->exec("DELETE FROM schema_migrations WHERE version = '002_admin'");

        $applied = (new \Prism\History\Migrator($this->pdo, __DIR__ . '/../migrations'))->run();

        $this->assertSame(['002_admin'], $applied);
        $this->assertSame('4', (string) $this->pdo->query('SELECT n FROM usage_counters')->fetchColumn());
    }

    private function stream(string $id, string $publicId, string $state = 'new'): void
    {
        $this->pdo->prepare(
            'INSERT INTO streams (id, public_id, url, name, groups_json, kind, state, source, added_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute([$id, $publicId, 'https://example.test/' . $id . '.m3u8', 'Name ' . $id, '["Other"]', 'hls', $state, 'test', '2026-11-12 03:00:00']);
    }

    public function testStreamsTableExists(): void
    {
        $this->assertContains('streams', $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN));

        $this->stream(str_repeat('a', 64), str_repeat('a', 12));
        $row = $this->pdo->query('SELECT state, state_reason, pinned, is_default, logo_tries, country, logo_file FROM streams')->fetch(PDO::FETCH_ASSOC);

        $this->assertSame('new', $row['state']);
        $this->assertNull($row['state_reason']);
        $this->assertSame([0, 0, 0], [(int) $row['pinned'], (int) $row['is_default'], (int) $row['logo_tries']]);
        $this->assertNull($row['country']);
        $this->assertNull($row['logo_file']);
    }

    public function testStreamPublicIdIsUnique(): void
    {
        $this->stream(str_repeat('a', 64), str_repeat('a', 12));

        $this->expectException(PDOException::class);
        $this->stream(str_repeat('b', 64), str_repeat('a', 12));
    }

    public function testStreamStateRejectsUnknownValues(): void
    {
        foreach (['new', 'working', 'suspect', 'dead', 'removed', 'unplayable', 'held'] as $i => $state) {
            $this->stream(str_pad((string) $i, 64, '0'), str_pad((string) $i, 12, '0'), $state);
        }
        $this->assertSame('7', (string) $this->pdo->query('SELECT COUNT(*) FROM streams')->fetchColumn());

        $this->expectException(PDOException::class);
        $this->stream(str_repeat('f', 64), str_repeat('f', 12), 'bogus');
    }

    public function testThirdMigrationCanBeRunAgain(): void
    {
        $this->stream(str_repeat('a', 64), str_repeat('a', 12), 'working');
        $this->pdo->exec("DELETE FROM schema_migrations WHERE version = '003_streams'");

        $applied = (new \Prism\History\Migrator($this->pdo, __DIR__ . '/../migrations'))->run();

        $this->assertSame(['003_streams'], $applied);
        $this->assertSame('working', $this->pdo->query('SELECT state FROM streams')->fetchColumn());
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
