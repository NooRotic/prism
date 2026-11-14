<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\AuditStore;
use Prism\History\Tests\Support\DbTestCase;

final class AuditStoreTest extends DbTestCase
{
    private const DAY_MS = 86_400_000;

    public function testRecordAndRecentNewestFirstLimitedToFifty(): void
    {
        $audit = new AuditStore($this->pdo, $this->clock);
        for ($i = 1; $i <= 60; $i++) {
            $audit->record('channel.remove', 'login' . $i, 'twitch_id=' . $i);
            $this->clock->advanceMs(1000);
        }

        $rows = $audit->recent();

        $this->assertCount(50, $rows);
        $this->assertSame('login60', $rows[0]['target']);
        $this->assertSame('login11', $rows[49]['target']);
        $this->assertSame(
            ['at' => '2026-11-12 03:00:59', 'action' => 'channel.remove', 'target' => 'login60', 'detail' => 'twitch_id=60'],
            $rows[0],
        );
        $this->assertCount(5, $audit->recent(5));
    }

    public function testRowsOlderThan180DaysArePurged(): void
    {
        $audit = new AuditStore($this->pdo, $this->clock);
        $audit->record('channel.remove', 'old', '');
        $this->clock->advanceMs(179 * self::DAY_MS);
        $audit->record('channel.unblock', 'middle', '');
        $this->assertCount(2, $audit->recent(), 'a 179 day old row is kept');

        $this->clock->advanceMs(2 * self::DAY_MS);
        $audit->record('channel.remove', 'new', '');

        $this->assertSame(['new', 'middle'], array_column($audit->recent(), 'target'));
    }

    public function testLongTextIsTruncatedNotRejected(): void
    {
        $audit = new AuditStore($this->pdo, $this->clock);

        $audit->record(str_repeat('a', 60), str_repeat('t', 150), str_repeat('d', 400));

        $row = $audit->recent()[0];
        $this->assertSame(40, strlen($row['action']));
        $this->assertSame(100, strlen($row['target']));
        $this->assertSame(255, strlen($row['detail']));
    }
}
