<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use InvalidArgumentException;
use Prism\History\ChannelPayload;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\Fixtures;

final class ChannelPayloadTest extends DbTestCase
{
    private ChannelStore $channels;
    private SnapshotStore $snapshots;
    private BioLinkStore $links;
    private ChannelPayload $payload;

    protected function setUp(): void
    {
        parent::setUp();
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
        $this->links = new BioLinkStore($this->pdo, $this->clock);
        $this->payload = new ChannelPayload($this->channels, $this->snapshots, $this->links, $this->clock);
        $this->channels->insertTracked(Fixtures::user('1', 'alice', ['broadcasterType' => 'affiliate']), Fixtures::info('1', 'en', 'Just Chatting'));
    }

    public function testShapeAndFieldNames(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', ['rank' => 300], 'ok');
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');
        $this->links->sync('1', [['platform' => 'kick', 'url' => 'https://kick.com/alice']]);

        $p = $this->payload->build('1');

        $this->assertSame(
            ['tracked', 'login', 'display_name', 'avatar_url', 'broadcaster_type', 'language', 'category', 'tracked_since', 'last_updated', 'tt_status', 'bio_links', 'latest', 'history'],
            array_keys($p),
        );
        $this->assertTrue($p['tracked']);
        $this->assertSame('alice', $p['login']);
        $this->assertSame('Alice', $p['display_name']);
        $this->assertSame('https://img.example/alice.png', $p['avatar_url']);
        $this->assertSame('affiliate', $p['broadcaster_type']);
        $this->assertSame('en', $p['language']);
        $this->assertSame('Just Chatting', $p['category']);
        $this->assertSame('2026-11-12', $p['tracked_since']);
        $this->assertSame([['platform' => 'kick', 'url' => 'https://kick.com/alice']], $p['bio_links']);
        $this->assertSame(
            [
                'date' => '2026-11-12',
                'rank' => 217,
                'minutes_streamed' => 5658,
                'avg_viewers' => 7372,
                'max_viewers' => 14676,
                'hours_watched' => 695155,
                'followers_change' => -3745,
                'followers_total' => 11292376,
                'tt_status' => 'ok',
            ],
            $p['latest'],
        );
        $this->assertSame(['2026-11-11', '2026-11-12'], array_column($p['history'], 'date'));
    }

    public function testHistoryRowsCarryNoFetchedAt(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');

        $p = $this->payload->build('1');

        $this->assertArrayNotHasKey('fetched_at', $p['latest']);
        $this->assertArrayNotHasKey('fetched_at', $p['history'][0]);
    }

    public function testNullFieldsStayNull(): void
    {
        $this->pdo->exec("UPDATE channels SET avatar_url = NULL, language = NULL, category = NULL");

        $p = $this->payload->build('1');

        $this->assertNull($p['avatar_url']);
        $this->assertNull($p['language']);
        $this->assertNull($p['category']);
    }

    public function testNoSnapshotsMeansNoneAndNothingToShow(): void
    {
        $p = $this->payload->build('1');

        $this->assertSame('none', $p['tt_status']);
        $this->assertNull($p['latest']);
        $this->assertNull($p['last_updated']);
        $this->assertSame([], $p['history']);
    }

    public function testTtStatusIsThatOfTheNewestAnswerThatIsNotAnError(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');
        $this->snapshots->upsert('1', '2026-11-12', [], 'error');

        $p = $this->payload->build('1');

        $this->assertSame('ok', $p['tt_status']);
        $this->assertSame('2026-11-11', $p['latest']['date']);
        $this->assertSame(['2026-11-11', '2026-11-12'], array_column($p['history'], 'date'));
    }

    public function testOnlyErrorsMeansError(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', [], 'error');

        $p = $this->payload->build('1');

        $this->assertSame('error', $p['tt_status']);
        $this->assertNull($p['latest']);
        $this->assertNull($p['last_updated']);
    }

    public function testUntrackedIsReported(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', [], 'untracked');

        $p = $this->payload->build('1');

        $this->assertSame('untracked', $p['tt_status']);
        $this->assertSame('untracked', $p['latest']['tt_status']);
    }

    public function testOverrideWinsWhatEverTheSnapshotsSay(): void
    {
        $this->snapshots->upsert('1', '2026-11-11', Fixtures::summary(), 'ok');

        $this->assertSame('pending', $this->payload->build('1', 90, 'pending')['tt_status']);
    }

    public function testLastUpdatedIsTheNewestGoodAnswersFetchTimeInIsoUtcWithZ(): void
    {
        $this->snapshots->upsert('1', '2026-11-12', Fixtures::summary(), 'ok');
        $this->clock->advanceMs(3_600_000);
        $this->snapshots->upsert('1', '2026-11-13', [], 'error');

        $this->assertSame('2026-11-12T03:00:00Z', $this->payload->build('1')['last_updated']);
    }

    public function testHistoryDefaultsToNinetyDaysAndIsEveryRowWhenNull(): void
    {
        $this->snapshots->upsert('1', '2026-08-01', ['rank' => 9], 'ok');
        $this->snapshots->upsert('1', '2026-11-12', ['rank' => 8], 'ok');

        $this->assertSame(['2026-11-12'], array_column($this->payload->build('1')['history'], 'date'));
        $this->assertSame(['2026-08-01', '2026-11-12'], array_column($this->payload->build('1', null)['history'], 'date'));
        $this->assertSame(['2026-11-12'], array_column($this->payload->build('1', 7)['history'], 'date'));
    }

    public function testOnlyTheCurrentBioLinksAreShown(): void
    {
        $this->links->sync('1', [['platform' => 'youtube', 'url' => 'https://www.youtube.com/@alice'], ['platform' => 'kick', 'url' => 'https://kick.com/alice']]);
        $this->clock->advanceMs(3_600_000);
        $this->channels->applyProfile('1', Fixtures::user('1', 'alice'), null);
        $this->links->sync('1', [['platform' => 'kick', 'url' => 'https://kick.com/alice']]);

        $this->assertSame([['platform' => 'kick', 'url' => 'https://kick.com/alice']], $this->payload->build('1')['bio_links']);
    }

    public function testAnUnknownChannelThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->payload->build('999');
    }
}
