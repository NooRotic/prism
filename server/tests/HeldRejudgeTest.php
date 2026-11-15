<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Playlist\HeldRejudge;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\AuditStore;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;

final class HeldRejudgeTest extends DbTestCase
{
    private StreamStore $store;
    private HeldRejudge $rejudge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = new StreamStore($this->pdo, $this->clock);
        $this->rejudge = new HeldRejudge($this->store, new AuditStore($this->pdo, $this->clock), $this->clock);
    }

    /** @return array<string,mixed> */
    private function put(string $url, string $state, ?string $reason): array
    {
        $id = StreamUrl::id($url);
        $row = [
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'S ' . $url, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => $state, 'state_reason' => $reason, 'source' => 'test',
        ];
        $this->store->insertIfNew($row);

        return $row;
    }

    /** @return array{0:string,1:?string} */
    private function stateOf(array $row): array
    {
        $found = $this->store->findByPublicId($row['public_id']);

        return [(string) $found['state'], $found['state_reason']];
    }

    private function auditRows(): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM admin_audit WHERE action = 'stream.rejudge'")->fetchColumn();
    }

    /** @return array<string,array<string,mixed>> */
    private function fixture(): array
    {
        return [
            'p1936' => $this->put('https://a.test:1936/x.m3u8', 'held', 'port'),
            'p8443' => $this->put('https://b.test:8443/x.m3u8', 'held', 'port'),
            'p22' => $this->put('https://c.test:22/x.m3u8', 'held', 'port'),
            'p6000' => $this->put('https://d.test:6000/x.m3u8', 'held', 'port'),
            'http' => $this->put('http://e.test:8080/x.m3u8', 'unplayable', 'http'),
            'other' => $this->put('https://f.test:9000/x.m3u8', 'held', 'something_else'),
        ];
    }

    public function testADryRunCountsTheCandidatesAndChangesNothing(): void
    {
        $rows = $this->fixture();

        $this->assertSame(['candidates' => 2, 'moved' => 0], $this->rejudge->run(false));

        foreach (['p1936', 'p8443', 'p22', 'p6000'] as $key) {
            $this->assertSame(['held', 'port'], $this->stateOf($rows[$key]), $key);
        }
        $this->assertSame(0, $this->auditRows());
    }

    public function testApplyMovesOnlyTheRowsTheNewRuleAllowsAndKeepsThemHidden(): void
    {
        $rows = $this->fixture();

        $this->assertSame(['candidates' => 2, 'moved' => 2], $this->rejudge->run(true));

        $this->assertSame(['held', 'awaiting_check'], $this->stateOf($rows['p1936']));
        $this->assertSame(['held', 'awaiting_check'], $this->stateOf($rows['p8443']));
        $this->assertSame(['held', 'port'], $this->stateOf($rows['p22']));
        $this->assertSame(['held', 'port'], $this->stateOf($rows['p6000']));
        $this->assertSame(['unplayable', 'http'], $this->stateOf($rows['http']));
        $this->assertSame(['held', 'something_else'], $this->stateOf($rows['other']));
        $this->assertSame([], $this->store->listed(), 'nothing became visible to visitors');
        $this->assertSame('S https://a.test:1936/x.m3u8', $this->store->findByPublicId($rows['p1936']['public_id'])['name'], 'nothing else about the row changed');
    }

    public function testApplyWritesOneAuditRowWithTheCountAndASecondApplyFindsNothing(): void
    {
        $this->fixture();

        $this->rejudge->run(true);

        $this->assertSame(1, $this->auditRows());
        $detail = (string) $this->pdo->query("SELECT detail FROM admin_audit WHERE action = 'stream.rejudge'")->fetchColumn();
        $this->assertStringContainsString('moved=2', $detail);

        $this->assertSame(['candidates' => 0, 'moved' => 0], $this->rejudge->run(true));
        $this->assertSame(1, $this->auditRows(), 'a run that moves nothing writes nothing');
    }

    public function testTheChangeIsTimedSoTheCheckerKnowsWhenItHappened(): void
    {
        $rows = $this->fixture();

        $this->rejudge->run(true);

        $at = (string) $this->pdo->query("SELECT state_changed_at FROM streams WHERE public_id = '" . $rows['p8443']['public_id'] . "'")->fetchColumn();
        $this->assertSame('2026-11-12 03:00:00', $at);
    }
}
