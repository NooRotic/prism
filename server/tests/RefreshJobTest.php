<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Container;
use Prism\History\RefreshJob;
use Prism\History\RunLock;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeClock;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\Fixtures;
use Prism\History\Tests\Support\World;

final class RefreshJobTest extends DbTestCase
{
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;

    private World $world;
    private FakeSleeper $sleeper;
    private ChannelStore $channels;
    private SnapshotStore $snapshots;
    private BioLinkStore $links;
    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->sleeper = new FakeSleeper($this->clock);
        $this->channels = new ChannelStore($this->pdo, $this->clock);
        $this->snapshots = new SnapshotStore($this->pdo, $this->clock);
        $this->links = new BioLinkStore($this->pdo, $this->clock);
        $this->logPath = sys_get_temp_dir() . '/prism-refresh-' . bin2hex(random_bytes(3)) . '.log';
    }

    protected function tearDown(): void
    {
        if (is_file($this->logPath)) {
            unlink($this->logPath);
        }
    }

    /** @param array<string,mixed> $override */
    private function job(array $override = []): RefreshJob
    {
        $config = World::config(array_replace_recursive(['log_path' => $this->logPath], $override));

        return Container::refreshJob($config, $this->pdo, $this->world->http, $this->clock, $this->sleeper);
    }

    /** A tracked channel whose profile was last read a day ago, so the job reads it again. */
    private function track(string $id, string $login, array $userExtra = []): void
    {
        $this->world->addUser($id, $login, $userExtra);
        $this->channels->insertTracked(Fixtures::user($id, $login), null);
        $this->pdo->prepare('UPDATE channels SET profile_checked_at = ? WHERE twitch_id = ?')->execute(['2026-11-11 03:00:00', $id]);
    }

    private function snapshotCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn();
    }

    public function testRefreshesADueChannelAndWritesOneSnapshotPerDate(): void
    {
        $this->track('1', 'alice');
        $this->world->answerTt('alice', World::summary());

        $counts = $this->job()->run();

        $this->assertSame(1, $counts['profiles']);
        $this->assertSame(1, $counts['tt_ok']);
        $this->assertSame('done', $counts['stopped_by']);
        $row = $this->snapshots->latest('1');
        $this->assertSame('2026-11-12', $row['date']);
        $this->assertSame(217, $row['rank']);
        $this->assertSame(-3745, $row['followers_change']);
        $this->assertSame(1, $this->snapshotCount());
    }

    public function testARerunTheSameDayMakesZeroTtCallsAndZeroProfileReads(): void
    {
        $this->track('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $job = $this->job();

        $job->run();
        $again = $job->run();

        $this->assertSame(1, $this->world->ttCalls());
        $this->assertSame(1, $this->world->twitchUserCalls());
        $this->assertSame(0, $again['tt_ok']);
        $this->assertSame(0, $again['profiles']);
        $this->assertSame(1, $this->snapshotCount());
    }

    public function testAProfileReadRecentlyIsNotReadAgain(): void
    {
        $this->world->addUser('1', 'alice');
        $this->channels->insertTracked(Fixtures::user('1', 'alice'), null);
        $this->world->answerTt('alice', World::summary());

        $counts = $this->job()->run();

        $this->assertSame(0, $counts['profiles']);
        $this->assertSame(0, $this->world->twitchUserCalls());
        $this->assertSame(1, $counts['tt_ok']);
    }

    public function testAnErrorSnapshotIsRetriedByTheNextRun(): void
    {
        $this->track('1', 'alice');
        $this->world->answerTt('alice', 'oops', 500);
        $job = $this->job();

        $first = $job->run();
        $this->assertSame(1, $first['tt_error']);
        $this->assertSame('error', $this->snapshots->latest('1')['tt_status']);

        $this->world->answerTt('alice', World::summary());
        $this->clock->advanceMs(5000);
        $second = $job->run();

        $this->assertSame(1, $second['tt_ok']);
        $this->assertSame('ok', $this->snapshots->latest('1')['tt_status']);
        $this->assertSame(1, $this->snapshotCount());
        $this->assertSame(2, $this->world->ttCalls());
    }

    public function testUntrackedIsNotAskedAgainUntilSevenDaysPass(): void
    {
        $this->track('1', 'alice');
        $job = $this->job();

        $first = $job->run();
        $this->assertSame(1, $first['tt_untracked']);

        for ($day = 1; $day <= 6; $day++) {
            $this->clock->advanceMs(self::DAY_MS);
            $this->pdo->exec("UPDATE channels SET last_visited_at = '" . gmdate('Y-m-d H:i:s', intdiv($this->clock->nowMs(), 1000)) . "'");
            $job->run();
        }
        $this->assertSame(1, $this->world->ttCalls());

        $this->clock->advanceMs(self::DAY_MS);
        $this->pdo->exec("UPDATE channels SET last_visited_at = '" . gmdate('Y-m-d H:i:s', intdiv($this->clock->nowMs(), 1000)) . "'");
        $job->run();
        $this->assertSame(2, $this->world->ttCalls());
    }

    public function testUntrackedChannelsDoNotCrowdOutOthersFromTheRunBudget(): void
    {
        // Two channels TT answered "untracked" four days ago (older fetches, so they sort first) and one that
        // simply errored yesterday. With a budget of one, only the TT rule keeps the quiet ones from taking it.
        foreach (['1' => 'quietone', '2' => 'quiettwo'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->snapshots->upsert((string) $id, '2026-11-08', [], 'untracked');
        }
        $this->track('3', 'busyone');
        $this->snapshots->upsert('3', '2026-11-11', [], 'error');
        $this->pdo->exec("UPDATE snapshots SET fetched_at = '2026-11-08 03:00:00' WHERE twitch_id IN ('1', '2')");
        $this->pdo->exec("UPDATE snapshots SET fetched_at = '2026-11-11 03:00:00' WHERE twitch_id = '3'");
        $this->world->answerTt('busyone', World::summary());

        $counts = $this->job(['tt' => ['run_budget' => 1]])->run();

        $this->assertSame(1, $counts['tt_ok']);
        $this->assertSame('3', (string) $this->pdo->query("SELECT twitch_id FROM snapshots WHERE tt_status = 'ok'")->fetchColumn());
    }

    public function testStopsAtTheRunBudgetAndTheRestIsTakenNextRun(): void
    {
        foreach (['1' => 'a', '2' => 'b', '3' => 'c'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->world->answerTt($login, World::summary());
        }
        $job = $this->job(['tt' => ['run_budget' => 2]]);

        $first = $job->run();
        $this->assertSame(2, $first['tt_ok']);
        $this->assertSame('budget', $first['stopped_by']);
        $this->assertSame(1, $first['tt_skipped']);

        $second = $job->run();
        $this->assertSame(1, $second['tt_ok']);
        $this->assertSame('done', $second['stopped_by']);
        $this->assertSame(3, $this->snapshotCount());
        $this->assertSame(3, $this->world->ttCalls());
    }

    public function testTheFirst429PausesTtAndEndsTheRun(): void
    {
        foreach (['1' => 'a', '2' => 'b'] as $id => $login) {
            $this->track((string) $id, $login);
        }
        $this->world->answerTt('a', '{}', 429, ['retry-after' => '30']);
        $this->world->answerTt('b', World::summary());
        $job = $this->job();

        $first = $job->run();
        $this->assertSame('rate_limited', $first['stopped_by']);
        $this->assertSame(1, $this->world->ttCalls());
        $this->assertSame(0, $this->snapshotCount());

        $second = $job->run();
        $this->assertSame('rate_limited', $second['stopped_by']);
        $this->assertSame(1, $this->world->ttCalls());
    }

    public function testMissingFromTwitchIsMarkedGoneAndGetsNoSnapshot(): void
    {
        $this->track('1', 'alice');
        $this->world->twitchUsers = [];
        $this->world->answerTt('alice', World::summary());

        $counts = $this->job()->run();

        $this->assertSame(1, $counts['gone']);
        $this->assertSame('gone', $this->pdo->query('SELECT status FROM channels')->fetchColumn());
        $this->assertSame(0, $this->world->ttCalls());
        $this->assertSame(0, $this->snapshotCount());
    }

    public function testUnvisitedForTailDaysBecomesDormantAndIsNotFetched(): void
    {
        $this->track('1', 'alice');
        $this->pdo->exec("UPDATE channels SET last_visited_at = '2026-10-10 03:00:00'");
        $this->world->answerTt('alice', World::summary());

        $counts = $this->job()->run();

        $this->assertSame(1, $counts['dormant']);
        $this->assertSame('dormant', $this->pdo->query('SELECT status FROM channels')->fetchColumn());
        $this->assertSame(0, $this->world->ttCalls());
    }

    public function testARenameUpdatesTheLoginAndTtIsAskedAboutTheNewOne(): void
    {
        $this->track('1', 'alice');
        $this->world->twitchUsers['1']['login'] = 'alice_new';
        $this->world->answerTt('alice_new', World::summary());

        $this->job()->run();

        $this->assertSame('alice_new', $this->pdo->query('SELECT login FROM channels')->fetchColumn());
        $this->assertSame('https://twitchtracker.com/api/channels/summary/alice_new', $this->world->requestsTo('https://twitchtracker.com/')[0]['url']);
    }

    public function testBioLinksAreSynced(): void
    {
        $this->track('1', 'alice', ['description' => 'on https://kick.com/alice and youtube.com/@alice']);
        $this->world->answerTt('alice', World::summary());

        $this->job()->run();

        $this->assertSame(
            [['platform' => 'kick', 'url' => 'https://kick.com/alice'], ['platform' => 'youtube', 'url' => 'https://www.youtube.com/@alice']],
            $this->links->current('1'),
        );
    }

    public function testTtDisabledStillRefreshesProfilesAndMakesNoTtCall(): void
    {
        $this->track('1', 'alice', ['display_name' => 'Alice Refreshed']);

        $counts = $this->job(['tt' => ['enabled' => false]])->run();

        $this->assertSame(1, $counts['profiles']);
        $this->assertSame('Alice Refreshed', $this->pdo->query('SELECT display_name FROM channels')->fetchColumn());
        $this->assertSame(0, $this->world->ttCalls());
        $this->assertSame(0, $this->snapshotCount());
    }

    public function testTwitchDownDoesNotStopTheTtNumbersAndTheRunSaysSo(): void
    {
        $this->track('1', 'alice');
        $this->world->usersStatus = 503;
        $this->world->answerTt('alice', World::summary());

        $counts = $this->job()->run();

        $this->assertSame('twitch_unavailable', $counts['stopped_by']);
        $this->assertSame(0, $counts['profiles']);
        $this->assertSame(1, $counts['tt_ok']);
        $this->assertSame(1, $this->snapshotCount());
    }

    public function testARunRecordsItsCountsAndAnAlreadyRunningOneDoesNot(): void
    {
        $state = new \Prism\History\Store\JobState($this->pdo, $this->clock);
        $this->assertNull($state->get('refresh_last_run'));
        $other = Database::pdo();
        $other->query("SELECT GET_LOCK('" . RunLock::NAME . "', 0)")->fetchColumn();

        $this->job()->run();
        $this->assertNull($state->get('refresh_last_run'), 'a run that did not get the lock is not a run');

        $other->query("SELECT RELEASE_LOCK('" . RunLock::NAME . "')")->fetchColumn();
        $this->job()->run();

        $stored = json_decode((string) $state->get('refresh_last_run'), true);
        $this->assertSame($this->clock->nowMs(), $stored['at_ms']);
        $this->assertSame('done', $stored['stopped_by']);
        $this->assertSame(0, $stored['tt_ok']);
        $this->assertArrayHasKey('profiles', $stored);
        $this->assertArrayHasKey('dormant', $stored);
    }

    public function testAnOverlappingRunDoesNothing(): void
    {
        $this->track('1', 'alice');
        $this->world->answerTt('alice', World::summary());
        $other = Database::pdo();
        $other->query("SELECT GET_LOCK('" . RunLock::NAME . "', 0)")->fetchColumn();

        $counts = $this->job()->run();

        $this->assertSame('already_running', $counts['stopped_by']);
        $this->assertSame(0, $counts['tt_ok']);
        $this->assertSame(0, $this->world->ttCalls());
        $this->assertSame(0, $this->world->twitchUserCalls());
        $this->assertStringContainsString('stopped_by=already_running', (string) file_get_contents($this->logPath));

        $other->query("SELECT RELEASE_LOCK('" . RunLock::NAME . "')")->fetchColumn();
        $this->assertSame('done', $this->job()->run()['stopped_by']);
    }

    public function testTheLockIsFreeAgainAfterARunAndAfterAFailure(): void
    {
        $this->track('1', 'alice');
        $this->world->ttThrowsFor = ['alice'];
        $other = Database::pdo();

        $this->job()->run();

        $this->assertSame('1', (string) $other->query("SELECT GET_LOCK('" . RunLock::NAME . "', 0)")->fetchColumn());
    }

    public function testAChannelAnsweredByAnotherProcessDuringTheRunIsNotAskedAgain(): void
    {
        foreach (['1' => 'a', '2' => 'b', '3' => 'c'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->world->answerTt($login, World::summary());
        }
        // While the run waits its turn for b, a visit files c's answer for today.
        $this->sleeper->onSleep = function (): void {
            $this->snapshots->upsert('3', '2026-11-12', World::summary(), 'ok');
        };

        $counts = $this->job()->run();

        $this->assertSame(2, $this->world->ttCalls());
        $this->assertSame(2, $counts['tt_ok']);
        $this->assertSame(1, $counts['tt_skipped']);
        $this->assertSame('done', $counts['stopped_by']);
        $this->assertSame(3, $this->snapshotCount());
    }

    public function testOneFailingChannelDoesNotStopTheRun(): void
    {
        foreach (['1' => 'badone', '2' => 'goodtwo', '3' => 'goodthree'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->world->answerTt($login, World::summary());
        }
        $this->world->ttThrowsFor = ['badone'];

        $counts = $this->job()->run();

        $this->assertSame(2, $counts['tt_ok']);
        $this->assertSame(1, $counts['tt_error']);
        $this->assertSame('done', $counts['stopped_by']);
        $this->assertSame('error', $this->snapshots->latest('1')['tt_status']);
        $log = (string) file_get_contents($this->logPath);
        $this->assertStringContainsString('channel_error', $log);
        $this->assertStringContainsString('RuntimeException', $log);
        $this->assertStringNotContainsString('simulated', $log);
    }

    public function testTenFailuresInARowStopTheRun(): void
    {
        for ($i = 1; $i <= 12; $i++) {
            $this->track((string) $i, 'chan' . $i);
            $this->world->answerTt('chan' . $i, 'oops', 500);
        }

        $counts = $this->job()->run();

        $this->assertSame('tt_unreachable', $counts['stopped_by']);
        $this->assertSame(10, $this->world->ttCalls());
        $this->assertSame(10, $counts['tt_error']);
        $this->assertSame(2, $counts['tt_skipped']);
    }

    public function testAnAnswerBreaksTheStreakOfFailures(): void
    {
        // Zero-padded ids, because ids are text and the run takes them in text order: 01..09 fail, 10 answers, 11..19 fail.
        for ($i = 1; $i <= 19; $i++) {
            $this->track(sprintf('%02d', $i), 'chan' . $i);
            if ($i === 10) {
                $this->world->answerTt('chan' . $i, World::summary());
            } else {
                $this->world->answerTt('chan' . $i, 'oops', 500);
            }
        }

        $counts = $this->job()->run();

        $this->assertSame('done', $counts['stopped_by']);
        $this->assertSame(18, $counts['tt_error']);
        $this->assertSame(1, $counts['tt_ok']);
    }

    public function testAGateThatStaysBusyStopsTheRunAsGateBusyNotAsBudget(): void
    {
        $this->track('1', 'alice');
        $this->pdo->prepare('UPDATE tt_gate SET last_call_ms = ? WHERE id = 1')->execute([$this->clock->nowMs() + 600_000]);

        $counts = $this->job()->run();

        $this->assertSame('gate_busy', $counts['stopped_by']);
        $this->assertSame(0, $this->world->ttCalls());
        $this->assertSame(1, $counts['tt_skipped']);
    }

    public function testTheLogLineHasCountsOnlyAndNoSecretsOrLogins(): void
    {
        $this->track('1', 'secretlogin');
        $this->world->answerTt('secretlogin', World::summary());

        $this->job()->run();

        $log = (string) file_get_contents($this->logPath);
        $this->assertStringContainsString('refresh', $log);
        $this->assertStringContainsString('tt_ok=1', $log);
        $this->assertStringContainsString('stopped_by=done', $log);
        $this->assertStringNotContainsString(World::SECRET, $log);
        $this->assertStringNotContainsString('secretlogin', $log);
        $this->assertCount(1, file($this->logPath));
    }

    public function testARunStraddlingUtcMidnightStampsEachChannelWithTheDateOfItsOwnCall(): void
    {
        $this->clock->set(FakeClock::at('2026-11-12T23:59:59Z')->nowMs());
        foreach (['1' => 'a', '2' => 'b'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->world->answerTt($login, World::summary());
        }

        $this->job()->run();

        $dates = $this->pdo->query('SELECT twitch_id, snap_date FROM snapshots ORDER BY twitch_id')->fetchAll(PDO::FETCH_KEY_PAIR);
        $this->assertSame(['1' => '2026-11-12', '2' => '2026-11-13'], $dates);
    }

    public function testTwoChannelsAreSpacedByTheGapEvenInOneRun(): void
    {
        foreach (['1' => 'a', '2' => 'b'] as $id => $login) {
            $this->track((string) $id, $login);
            $this->world->answerTt($login, World::summary());
        }

        $this->job()->run();

        $this->assertGreaterThanOrEqual(1500, $this->sleeper->totalMs);
    }
}
