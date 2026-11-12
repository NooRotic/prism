<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\TtPolicy;

final class TtPolicyTest extends DbTestCase
{
    private const TODAY = '2026-11-12';

    private SnapshotStore $snapshots;

    protected function setUp(): void
    {
        parent::setUp();
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
        (new ChannelStore($this->pdo, $this->clock))->insertTracked(Fixtures::user('1', 'alice'), null);
    }

    private function may(): bool
    {
        return TtPolicy::mayCall($this->snapshots, '1', self::TODAY, 7);
    }

    public function testNoSnapshotsMayCall(): void
    {
        $this->assertTrue($this->may());
    }

    public function testOkTodayMayNot(): void
    {
        $this->snapshots->upsert('1', self::TODAY, Fixtures::summary(), 'ok');

        $this->assertFalse($this->may());
    }

    public function testOkYesterdayMay(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');

        $this->assertTrue($this->may());
    }

    public function testErrorTodayMay(): void
    {
        $this->snapshots->upsert('1', self::TODAY, [], 'error');

        $this->assertTrue($this->may());
    }

    public function testUntrackedTodayMayNotBeAskedAgain(): void
    {
        $this->snapshots->upsert('1', self::TODAY, [], 'untracked');

        $this->assertFalse($this->may());
    }

    public function testUntrackedYesterdayMayNot(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', [], 'untracked');

        $this->assertFalse($this->may());
    }

    public function testUntrackedSixDaysAgoMayStillNot(): void
    {
        $this->snapshots->upsert('1', '2026-11-06', [], 'untracked');

        $this->assertFalse($this->may());
    }

    public function testUntrackedSevenDaysAgoMay(): void
    {
        $this->snapshots->upsert('1', '2026-11-05', [], 'untracked');

        $this->assertTrue($this->may());
    }

    public function testUntrackedThreeDaysAgoWithAnErrorTodayMayNot(): void
    {
        $this->snapshots->upsert('1', '2026-11-09', [], 'untracked');
        $this->snapshots->upsert('1', self::TODAY, [], 'error');

        $this->assertFalse($this->may());
    }

    public function testAnOkAnswerAfterAnOldUntrackedOneMayCallAgainTomorrow(): void
    {
        $this->snapshots->upsert('1', '2026-11-01', [], 'untracked');
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');

        $this->assertTrue($this->may());
    }
}
