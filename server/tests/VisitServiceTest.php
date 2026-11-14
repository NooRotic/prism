<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\BioLinks;
use Prism\History\ChannelPayload;
use Prism\History\Config;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\JobState;
use Prism\History\Store\SnapshotStore;
use Prism\History\Store\UsageCounters;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\Tests\Support\World;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TwitchClient;
use Prism\History\VisitResult;
use Prism\History\VisitService;

final class VisitServiceTest extends DbTestCase
{
    private const DAY_MS = 86_400_000;

    private World $world;
    private ChannelStore $channels;
    private SnapshotStore $snapshots;
    private BioLinkStore $links;
    private JobState $state;
    private FakeSleeper $sleeper;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
        $this->links = new BioLinkStore($this->pdo, $this->clock);
        $this->state = new JobState($this->pdo, $this->clock);
        $this->sleeper = new FakeSleeper($this->clock);
    }

    /** @param array<string,mixed> $override */
    private function service(array $override = [], int $maxWaitMs = 3000): VisitService
    {
        $config = World::config($override);
        $gate = new TtGate($this->pdo, $this->clock, $this->sleeper, $this->state, $config->ttGapMs(), $config->ttRunBudget(), $config->ttDayBudget(), $maxWaitMs);

        return new VisitService(
            $config,
            $this->channels,
            $this->snapshots,
            $this->links,
            new TwitchClient($this->world->http, $this->state, $this->clock, 'cid', World::SECRET),
            new TrackerClient($this->world->http, World::UA),
            $gate,
            new ChannelPayload($this->channels, $this->snapshots, $this->links, $this->clock),
            $this->clock,
            $this->state,
            new UsageCounters($this->pdo, $this->clock),
        );
    }

    private function rows(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    public function testAFirstVisitCountsOneNewChannelAndARepeatCountsNone(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $counters = new UsageCounters($this->pdo, $this->clock);

        $this->assertSame(VisitResult::OK, $this->service()->visit('alice')->outcome);
        $this->assertSame(1, $counters->valueOn('2026-11-12', 'new_channels'));

        $this->assertSame(VisitResult::OK, $this->service()->visit('alice')->outcome);
        $this->assertSame(1, $counters->valueOn('2026-11-12', 'new_channels'));
    }

    public function testAVisitStillSucceedsWhenTheCounterTableIsMissing(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $this->pdo->exec('DROP TABLE usage_counters');

        $result = $this->service()->visit('alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame(1, $this->rows('channels'));
    }

    public function testInvalidLoginMakesNoRequests(): void
    {
        $service = $this->service();

        foreach (['a b', '', str_repeat('a', 26), 'ünï', 'a/b'] as $login) {
            $this->assertSame(VisitResult::INVALID, $service->visit($login)->outcome, $login);
        }

        $this->assertSame([], $this->world->http->requests);
    }

    public function testKillSwitchReturnsDisabled(): void
    {
        $this->world->addUser('1', 'alice');

        $result = $this->service(['flags' => ['visits_enabled' => false]])->visit('alice');

        $this->assertSame(VisitResult::DISABLED, $result->outcome);
        $this->assertSame([], $this->world->http->requests);
    }

    public function testBlockedLoginIsBlockedWithoutAnyRequest(): void
    {
        $this->channels->block('9', 'alice');

        $result = $this->service()->visit('Alice');

        $this->assertSame(VisitResult::BLOCKED, $result->outcome);
        $this->assertSame([], $this->world->http->requests);
    }

    public function testNewRealChannelIsInsertedAndTtFetchedOnTheSpot(): void
    {
        $this->world->addUser('1', 'alice', ['description' => 'Find me on kick.com/alice_live']);
        $this->world->answerTt('alice', World::summary());

        $result = $this->service()->visit('Alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $p = $result->payload;
        $this->assertTrue($p['tracked']);
        $this->assertSame('alice', $p['login']);
        $this->assertSame('ok', $p['tt_status']);
        $this->assertSame('Just Chatting', $p['category']);
        $this->assertSame([['platform' => 'kick', 'url' => 'https://kick.com/alice_live']], $p['bio_links']);
        $this->assertSame(['2026-11-12'], array_column($p['history'], 'date'));
        $this->assertSame(217, $p['latest']['rank']);
        $this->assertSame(1, $this->rows('channels'));
        $this->assertSame(1, $this->world->ttCalls());
        $this->assertSame('https://twitchtracker.com/api/channels/summary/alice', $this->world->requestsTo('https://twitchtracker.com/')[0]['url']);
    }

    public function testUnknownToTwitchIsNotFoundAndNothingIsStored(): void
    {
        $result = $this->service()->visit('ghost');

        $this->assertSame(VisitResult::NOT_FOUND, $result->outcome);
        $this->assertSame(0, $this->rows('channels'));
        $this->assertSame(0, $this->world->ttCalls());
    }

    public function testHourlyCapReturnsCapStoresNothingAndSavesTheTwitchCall(): void
    {
        foreach (['1' => 'a', '2' => 'b', '3' => 'c'] as $id => $login) {
            $this->world->addUser((string) $id, $login);
        }
        $service = $this->service(['tracking' => ['new_per_hour' => 2]]);

        $this->assertSame(VisitResult::OK, $service->visit('a')->outcome);
        $this->assertSame(VisitResult::OK, $service->visit('b')->outcome);
        $callsBefore = $this->world->twitchUserCalls();
        $third = $service->visit('c');

        $this->assertSame(VisitResult::CAP, $third->outcome);
        $this->assertSame(2, $this->rows('channels'));
        $this->assertSame($callsBefore, $this->world->twitchUserCalls());
    }

    public function testTheHourlyCapOpensAgainAnHourLater(): void
    {
        foreach (['1' => 'a', '2' => 'b'] as $id => $login) {
            $this->world->addUser((string) $id, $login);
        }
        $service = $this->service(['tracking' => ['new_per_hour' => 1]]);

        $this->assertSame(VisitResult::OK, $service->visit('a')->outcome);
        $this->assertSame(VisitResult::CAP, $service->visit('b')->outcome);
        $this->clock->advanceMs(3_600_000 + 1000);

        $this->assertSame(VisitResult::OK, $service->visit('b')->outcome);
    }

    public function testDailyCap(): void
    {
        foreach (['1' => 'a', '2' => 'b', '3' => 'c'] as $id => $login) {
            $this->world->addUser((string) $id, $login);
        }
        $service = $this->service(['tracking' => ['new_per_hour' => 100, 'new_per_day' => 2]]);

        $this->assertSame(VisitResult::OK, $service->visit('a')->outcome);
        $this->clock->advanceMs(2 * 3_600_000);
        $this->assertSame(VisitResult::OK, $service->visit('b')->outcome);
        $this->clock->advanceMs(2 * 3_600_000);

        $this->assertSame(VisitResult::CAP, $service->visit('c')->outcome);
        $this->assertSame(2, $this->rows('channels'));
    }

    public function testNewChannelsSwitchOffReturnsCapButKnownChannelsStillAnswer(): void
    {
        $this->world->addUser('1', 'known');
        $this->world->addUser('2', 'fresh');
        $this->channels->insertTracked(Fixtures::user('1', 'known'), null);
        $this->world->answerTt('known', World::summary());

        $service = $this->service(['flags' => ['new_channels_enabled' => false]]);

        $this->assertSame(VisitResult::CAP, $service->visit('fresh')->outcome);
        $this->assertSame(VisitResult::OK, $service->visit('known')->outcome);
    }

    public function testKnownChannelWithoutTodaysSnapshotFetchesTtOnceAndASecondVisitDoesNot(): void
    {
        $this->world->addUser('1', 'alice');
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->snapshots->upsert('1', '2026-11-11', World::summary(300), 'ok');
        $this->world->answerTt('alice', World::summary(217));
        $service = $this->service();

        $first = $service->visit('alice');
        $this->clock->advanceMs(3_600_000);
        $second = $service->visit('alice');

        $this->assertSame(1, $this->world->ttCalls());
        $this->assertSame(217, $first->payload['latest']['rank']);
        $this->assertSame(217, $second->payload['latest']['rank']);
        $this->assertSame(['2026-11-11', '2026-11-12'], array_column($second->payload['history'], 'date'));
    }

    public function testAnUntrackedAnswerIsStoredAndNotAskedAgainWithinSevenDays(): void
    {
        $this->world->addUser('1', 'alice');
        $service = $this->service();

        $first = $service->visit('alice');
        $this->assertSame('untracked', $first->payload['tt_status']);

        for ($day = 1; $day <= 6; $day++) {
            $this->clock->advanceMs(self::DAY_MS);
            $service->visit('alice');
        }
        $this->assertSame(1, $this->world->ttCalls());

        $this->clock->advanceMs(self::DAY_MS);
        $service->visit('alice');
        $this->assertSame(2, $this->world->ttCalls());
    }

    public function testARateLimitedAnswerPausesTheGateAndLeavesPending(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->addUser('2', 'bob');
        $this->world->answerTt('alice', '{}', 429, ['retry-after' => '60']);
        $service = $this->service();

        $result = $service->visit('alice');
        $other = $service->visit('bob');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('pending', $result->payload['tt_status']);
        $this->assertSame([], $result->payload['history']);
        $this->assertSame('pending', $other->payload['tt_status']);
        $this->assertSame(1, $this->world->ttCalls());
    }

    public function testABusyGateLeavesTtStatusPendingAndMakesNoTtCall(): void
    {
        $this->world->addUser('1', 'alice');
        $this->pdo->prepare('UPDATE tt_gate SET last_call_ms = ? WHERE id = 1')->execute([$this->clock->nowMs()]);

        $result = $this->service([], 1000)->visit('alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('pending', $result->payload['tt_status']);
        $this->assertSame(0, $this->world->ttCalls());
    }

    public function testATtErrorIsStoredAsErrorAndRetriedByTheNextVisit(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', 'oops', 500);
        $service = $this->service();

        $first = $service->visit('alice');
        $this->assertSame('error', $first->payload['tt_status']);
        $this->assertSame(1, $this->rows('snapshots'));

        $this->world->answerTt('alice', World::summary());
        $this->clock->advanceMs(5000);
        $second = $service->visit('alice');

        $this->assertSame('ok', $second->payload['tt_status']);
        $this->assertSame(2, $this->world->ttCalls());
        $this->assertSame(1, $this->rows('snapshots'));
    }

    public function testAStaleLoginReResolvesAndDoesNotAnswerWithAnotherChannelsRow(): void
    {
        $this->world->addUser('1', 'bob_new_name');
        $this->world->addUser('2', 'alice', ['display_name' => 'Alice The Second']);
        $this->clock->advanceMs(-2 * self::DAY_MS);
        $this->channels->insertTracked(Fixtures::user('1', 'alice', ['displayName' => 'Alice The First']), null);
        $this->clock->advanceMs(2 * self::DAY_MS);
        $checkedBefore = $this->pdo->query("SELECT profile_checked_at FROM channels WHERE twitch_id = '1'")->fetchColumn();

        $result = $this->service()->visit('alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('Alice The Second', $result->payload['display_name']);
        $this->assertSame('2', (string) $this->pdo->query("SELECT twitch_id FROM channels WHERE display_name = 'Alice The Second'")->fetchColumn());
        $this->assertSame($checkedBefore, $this->pdo->query("SELECT profile_checked_at FROM channels WHERE twitch_id = '1'")->fetchColumn());
        $this->assertSame(2, $this->rows('channels'));
    }

    public function testARenamedChannelIsFollowedByTheVisit(): void
    {
        $this->world->addUser('1', 'alice_new');
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);

        $result = $this->service()->visit('alice_new');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('alice_new', $result->payload['login']);
        $this->assertSame(1, $this->rows('channels'));
    }

    public function testTwoVisitsToTheSameNewChannelInARowCreateOneRowAndOneTwitchLookup(): void
    {
        $this->world->addUser('1', 'alice');
        $service = $this->service();

        $service->visit('alice');
        $service->visit('alice');

        $this->assertSame(1, $this->rows('channels'));
        $this->assertSame(1, $this->world->twitchUserCalls());
    }

    public function testTwitchDownForAnUnknownChannelIsUnavailableAndStoresNothing(): void
    {
        $this->world->usersStatus = 503;

        $result = $this->service()->visit('alice');

        $this->assertSame(VisitResult::UNAVAILABLE, $result->outcome);
        $this->assertSame(0, $this->rows('channels'));
    }

    public function testTwitchDownForAKnownChannelStillAnswersFromTheStore(): void
    {
        $this->clock->advanceMs(-2 * self::DAY_MS);
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->clock->advanceMs(2 * self::DAY_MS);
        $this->world->usersStatus = 503;
        $this->world->answerTt('alice', World::summary());

        $result = $this->service()->visit('alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('alice', $result->payload['login']);
        $this->assertSame('ok', $result->payload['tt_status']);
    }

    public function testTtDisabledInConfigMakesNoTtCall(): void
    {
        $this->world->addUser('1', 'alice');

        $result = $this->service(['tt' => ['enabled' => false]])->visit('alice');

        $this->assertSame(VisitResult::OK, $result->outcome);
        $this->assertSame('none', $result->payload['tt_status']);
        $this->assertSame(0, $this->world->ttCalls());
    }

    public function testAVisitJustAfterUtcMidnightNeedsANewTtCall(): void
    {
        $this->clock->set(FakeClock::at('2026-11-12T23:59:58Z')->nowMs());
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $service = $this->service();

        $service->visit('alice');
        $service->visit('alice');
        $this->assertSame(1, $this->world->ttCalls());

        $this->clock->set(FakeClock::at('2026-11-13T00:00:01Z')->nowMs());
        $result = $service->visit('alice');

        $this->assertSame(2, $this->world->ttCalls());
        $this->assertSame(['2026-11-12', '2026-11-13'], array_column($result->payload['history'], 'date'));
    }

    public function testBlockedByIdAfterResolutionIsBlocked(): void
    {
        $this->world->addUser('7', 'newname');
        $this->channels->block('7', 'oldname');

        $result = $this->service()->visit('newname');

        $this->assertSame(VisitResult::BLOCKED, $result->outcome);
        $this->assertSame(0, $this->rows('channels'));
    }

    public function testAVisitWakesADormantChannel(): void
    {
        $this->world->addUser('1', 'alice');
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->pdo->exec("UPDATE channels SET status = 'dormant'");
        $this->clock->advanceMs(60_000);

        $this->service()->visit('alice');

        $this->assertSame('tracking', $this->pdo->query('SELECT status FROM channels')->fetchColumn());
    }

    public function testAGoneChannelThatTwitchFindsAgainIsRevived(): void
    {
        $this->world->addUser('1', 'alice');
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->channels->markGone('1');
        $this->clock->advanceMs(2 * 3_600_000);

        $this->service()->visit('alice');

        $this->assertSame('tracking', $this->pdo->query('SELECT status FROM channels')->fetchColumn());
    }

    public function testAGoneChannelIsLookedUpAtMostOnceAnHourAndGetsNoTtCall(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->channels->markGone('1');
        $this->clock->advanceMs(2 * 3_600_000);
        $service = $this->service();

        $first = $service->visit('alice');
        $second = $service->visit('alice');

        $this->assertSame(VisitResult::OK, $first->outcome);
        $this->assertSame(VisitResult::OK, $second->outcome);
        $this->assertSame(1, $this->world->twitchUserCalls());
        $this->assertSame(0, $this->world->ttCalls());
        $this->assertSame('gone', $this->pdo->query('SELECT status FROM channels')->fetchColumn());

        $this->clock->advanceMs(3_600_000 + 1000);
        $service->visit('alice');
        $this->assertSame(2, $this->world->twitchUserCalls());
    }

    public function testAVisitDoesNotCallTtWhenAnotherProcessAnsweredWhileItWaitedForItsTurn(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->addUser('2', 'bob');
        $this->world->answerTt('alice', World::summary());
        $this->world->answerTt('bob', World::summary());
        $service = $this->service();
        $service->visit('alice');

        // Bob's visit has to wait for the gap; meanwhile a scheduled run files Bob's answer for today.
        $this->sleeper->onSleep = function (): void {
            $this->snapshots->upsert('2', '2026-11-12', World::summary(), 'ok');
        };
        $result = $service->visit('bob');

        $this->assertSame(1, $this->world->ttCalls());
        $this->assertSame('ok', $result->payload['tt_status']);
        $this->assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM snapshots WHERE twitch_id = '2'")->fetchColumn());
    }

    public function testMadeUpLoginsCannotDrainTheTwitchBudget(): void
    {
        $service = $this->service(['tracking' => ['lookups_per_hour' => 3, 'new_per_hour' => 100, 'new_per_day' => 1000]]);

        foreach (['aaa', 'bbb', 'ccc'] as $login) {
            $this->assertSame(VisitResult::NOT_FOUND, $service->visit($login)->outcome, $login);
        }
        $callsBefore = $this->world->twitchUserCalls();

        $this->assertSame(VisitResult::CAP, $service->visit('ddd')->outcome);
        $this->assertSame($callsBefore, $this->world->twitchUserCalls());

        $this->clock->advanceMs(3_600_000);
        $this->assertSame(VisitResult::NOT_FOUND, $service->visit('ddd')->outcome);
    }

    public function testKnownChannelsNeverUseTheLookupBudget(): void
    {
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->world->addUser('1', 'alice');
        $service = $this->service(['tracking' => ['lookups_per_hour' => 0]]);

        $this->assertSame(VisitResult::OK, $service->visit('alice')->outcome);
        $this->assertSame(VisitResult::CAP, $service->visit('someonenew')->outcome);
    }

    public function testNoSecretReachesAnyRequestBodyOutsideTheTokenCall(): void
    {
        $this->world->addUser('1', 'alice');
        $this->world->answerTt('alice', World::summary());

        $this->service()->visit('alice');

        foreach ($this->world->http->requests as $request) {
            if (str_starts_with($request['url'], 'https://id.twitch.tv/')) {
                continue;
            }
            $this->assertStringNotContainsString(World::SECRET, json_encode($request));
        }
    }
}
