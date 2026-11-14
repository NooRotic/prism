<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Api\Router;
use Prism\History\Container;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\AuditStore;
use Prism\History\Store\JobState;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\World;

final class AdminApiTest extends DbTestCase
{
    private const ORIGIN = 'https://prism.nooroticx.tv';
    private const OWNER_ID = '7771234567';
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const STRANGER_TOKEN = 'strangertoken012345678strangerx';
    private const TODAY = '2026-11-12';
    private const HOUR_MS = 3_600_000;
    private const DAY_MS = 86_400_000;

    private World $world;
    private JobState $state;

    /** @var list<ApiResponse> */
    private array $seen = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
        $this->world->grantToken(self::OWNER_TOKEN, self::OWNER_ID, 'theowner', 'front');
        $this->state = new JobState($this->pdo, $this->clock);
    }

    /** @param array<string,mixed> $override */
    private function router(array $override = ['admin' => ['owner_twitch_id' => self::OWNER_ID, 'frontend_client_id' => 'front']]): Router
    {
        return Container::router(World::config($override), $this->pdo, $this->world->http, $this->clock, new FakeSleeper($this->clock));
    }

    /** @param array<string,string> $query */
    private function call(string $method, string $path, array $query = [], ?string $token = self::OWNER_TOKEN, ?Router $router = null, string $body = ''): ApiResponse
    {
        $request = new Request($method, $path, $query, self::ORIGIN, $body, $token === null ? null : 'Bearer ' . $token);
        $response = ($router ?? $this->router())->handle($request);
        $this->seen[] = $response;

        return $response;
    }

    /** @return array<string,mixed> */
    private function get(string $path, array $query = []): array
    {
        $response = $this->call('GET', $path, $query);
        $this->assertSame(200, $response->status, $path . ' ' . $response->body);

        return json_decode($response->body, true, 512, JSON_THROW_ON_ERROR);
    }

    private function seedHits(string $date, string $key, int $n): void
    {
        $this->pdo->prepare('INSERT INTO usage_counters (day_utc, k, n) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE n = VALUES(n)')->execute([$date, $key, $n]);
    }

    private function seedRun(int $ageMs): void
    {
        $this->state->set('refresh_last_run', json_encode(['at_ms' => $this->clock->nowMs() - $ageMs, 'stopped_by' => 'done', 'tt_ok' => 12], JSON_THROW_ON_ERROR));
    }

    /** @return list<string> */
    private function codes(): array
    {
        return $this->get('/api/admin/overview')['needs_attention'];
    }

    public function testEveryAdminPathIsNotFoundWhenTheAdminSideIsOff(): void
    {
        $off = $this->router(['admin' => ['owner_twitch_id' => self::OWNER_ID, 'frontend_client_id' => 'front', 'enabled' => false]]);
        $unset = $this->router([]);

        foreach ([$off, $unset] as $router) {
            foreach (['/api/admin/session', '/api/admin/overview', '/api/admin/usage', '/api/admin/tt', '/api/admin/security', '/api/admin/whatever'] as $path) {
                $response = $this->call('GET', $path, [], self::OWNER_TOKEN, $router);

                $this->assertSame(404, $response->status, $path);
                $this->assertSame(['error' => 'not_found'], json_decode($response->body, true));
            }
        }
        $this->assertSame(0, $this->world->validationCalls());
        $this->assertSame('0', (string) $this->pdo->query('SELECT COUNT(*) FROM usage_counters')->fetchColumn());
    }

    public function testNoTokenIs401AndOnlyCountsSignedOut(): void
    {
        $response = $this->call('GET', '/api/admin/overview', [], null);

        $this->assertSame(401, $response->status);
        $this->assertSame(['error' => 'signed_out'], json_decode($response->body, true));
        $this->assertSame('no-store', $response->headers['Cache-Control']);
        $this->assertSame(self::ORIGIN, $response->headers['Access-Control-Allow-Origin']);
        $this->assertSame('1', (string) $this->pdo->query("SELECT n FROM usage_counters WHERE k = 'signed_out'")->fetchColumn());
        $this->assertSame(0, $this->world->validationCalls());
    }

    public function testGuardDecisionsMapToStatusAndBody(): void
    {
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
        $named = $this->call('GET', '/api/admin/session', [], self::STRANGER_TOKEN);
        $this->assertSame(403, $named->status);
        $this->assertSame(['error' => 'forbidden', 'recorded' => true], json_decode($named->body, true));

        $this->world->grantToken('ownerwrongkind0123456789ownerw', self::OWNER_ID, 'theowner', 'front', ['bits:read']);
        $unnamed = $this->call('GET', '/api/admin/session', [], 'ownerwrongkind0123456789ownerw');
        $this->assertSame(403, $unnamed->status);
        $this->assertSame(['error' => 'forbidden', 'recorded' => false], json_decode($unnamed->body, true));

        $this->world->validateStatus = 503;
        $down = $this->call('GET', '/api/admin/session', [], 'brandnewtoken0123456789brandnew');
        $this->assertSame(503, $down->status);
        $this->assertSame(['error' => 'unavailable'], json_decode($down->body, true));
        $this->world->validateStatus = 200;

        for ($i = 0; $i < 30; $i++) {
            $this->call('GET', '/api/admin/session', [], sprintf('fake%026d', $i));
        }
        $busy = $this->call('GET', '/api/admin/session', [], sprintf('fake%026d', 99));
        $this->assertSame(429, $busy->status);
        $this->assertSame('60', $busy->headers['Retry-After']);
        $this->assertSame(['error' => 'busy'], json_decode($busy->body, true));
    }

    public function testSessionReturnsOwnerAndTheFixedLimitsOnly(): void
    {
        $body = $this->get('/api/admin/session');

        $this->assertSame(
            ['owner' => true, 'limits' => ['tt_day_budget' => 1500, 'tt_run_budget' => 300, 'new_per_day' => 200, 'tail_days' => 30]],
            $body,
        );
    }

    public function testOverviewNumbersAndTheFourNeedsAttentionCodes(): void
    {
        $this->seedHits(self::TODAY, 'hit:home', 3);
        $this->seedHits(self::TODAY, 'hit:twitch', 2);
        $this->seedHits('2026-11-11', 'hit:home', 4);
        $this->seedHits(self::TODAY, 'signed_out', 14);
        $this->state->set('tt_calls:' . self::TODAY, '100');
        $this->seedRun(self::HOUR_MS);

        $quiet = $this->get('/api/admin/overview');

        $this->assertSame(['today' => 5, 'yesterday' => 4], $quiet['pages']);
        $this->assertCount(14, $quiet['chart']);
        $this->assertSame(['date' => '2026-10-30', 'pages' => 0], $quiet['chart'][0]);
        $this->assertSame(['date' => '2026-11-11', 'pages' => 4], $quiet['chart'][12]);
        $this->assertSame(['date' => self::TODAY, 'pages' => 5], $quiet['chart'][13]);
        $this->assertSame(['today' => 100, 'paused' => false], $quiet['tt']);
        $this->assertSame(['named_7d' => 0, 'signed_out_today' => 14], $quiet['refused']);
        $this->assertSame([], $quiet['needs_attention']);

        // a 429 pause
        $this->state->set('tt_paused_until_ms', (string) ($this->clock->nowMs() + self::HOUR_MS));
        $this->assertSame(['tt_paused'], $this->codes());
        $this->assertTrue($this->get('/api/admin/overview')['tt']['paused']);
        $this->state->delete('tt_paused_until_ms');

        // the scheduled refresh: never recorded, 9 hours ago, 7 hours ago
        $this->state->delete('refresh_last_run');
        $this->assertSame(['job_stale'], $this->codes());
        $this->seedRun(9 * self::HOUR_MS);
        $this->assertSame(['job_stale'], $this->codes());
        $this->seedRun(7 * self::HOUR_MS);
        $this->assertSame([], $this->codes());

        // above 80% of the day budget (1,500): exactly 1,200 is not above
        $this->state->set('tt_calls:' . self::TODAY, '1200');
        $this->assertSame([], $this->codes());
        $this->state->set('tt_calls:' . self::TODAY, '1201');
        $this->assertSame(['tt_budget_80'], $this->codes());
        $this->state->set('tt_calls:' . self::TODAY, '100');

        // a named refused attempt: 8 days ago does not count, 6 days ago does
        $this->pdo->prepare('INSERT INTO admin_attempts (twitch_id, login, first_attempt_at, last_attempt_at) VALUES (?, ?, ?, ?)')
            ->execute(['2000', 'old', '2026-11-04 03:00:00', '2026-11-04 03:00:00']);
        $this->assertSame([], $this->codes());
        $this->pdo->prepare('INSERT INTO admin_attempts (twitch_id, login, first_attempt_at, last_attempt_at) VALUES (?, ?, ?, ?)')
            ->execute(['3000', 'recent', '2026-11-06 03:00:00', '2026-11-06 03:00:00']);
        $this->assertSame(['named_refused_7d'], $this->codes());
        $this->assertSame(1, $this->get('/api/admin/overview')['refused']['named_7d']);
    }

    public function testNewChannelsUsesTheRollingTwentyFourHours(): void
    {
        $insert = $this->pdo->prepare(
            'INSERT INTO channels (twitch_id, login, first_seen_at, last_visited_at, tracked_since) VALUES (?, ?, ?, ?, ?)',
        );
        $insert->execute(['1', 'old', '2026-11-11 02:00:00', '2026-11-11 02:00:00', '2026-11-11']); // 25 hours ago
        $insert->execute(['2', 'recent', '2026-11-11 04:00:00', '2026-11-11 04:00:00', '2026-11-11']); // 23 hours ago
        $insert->execute(['3', 'today', '2026-11-12 02:00:00', '2026-11-12 02:00:00', '2026-11-12']);

        $this->assertSame(['last_24h' => 2], $this->get('/api/admin/overview')['new_channels']);
    }

    public function testUsageIsZeroFilledPerSectionAndRejectsOtherDays(): void
    {
        $this->seedHits(self::TODAY, 'hit:hls-dash', 7);
        $this->seedHits('2026-11-10', 'hit:chat-popout', 2);
        $this->seedHits(self::TODAY, 'hit:twitch', 1);

        $days = $this->get('/api/admin/usage')['days'];

        $this->assertCount(14, $days);
        $this->assertSame(
            ['date' => self::TODAY, 'home' => 0, 'twitch' => 1, 'youtube' => 0, 'hls-dash' => 7, 'chat-popout' => 0, 'other' => 0],
            $days[13],
        );
        $this->assertSame(2, $days[11]['chat-popout']);
        $this->assertCount(30, $this->get('/api/admin/usage', ['days' => '30'])['days']);
        $this->assertCount(90, $this->get('/api/admin/usage', ['days' => '90'])['days']);
        foreach (['0', '7', '15', 'abc', '', '30 ', '-14'] as $bad) {
            $response = $this->call('GET', '/api/admin/usage', ['days' => $bad]);

            $this->assertSame(400, $response->status, "days={$bad}");
            $this->assertSame(['error' => 'bad_days'], json_decode($response->body, true));
        }
    }

    public function testTtListsDaysFromJobStateAndTheLastRun(): void
    {
        $this->state->set('tt_calls:2026-11-11', '7');
        $this->state->set('tt_calls:' . self::TODAY, '12');
        $none = $this->get('/api/admin/tt');
        $this->assertCount(30, $none['days']);
        $this->assertNull($none['paused_until']);
        $this->assertNull($none['last_run']);
        $this->assertSame(['date' => '2026-11-11', 'calls' => 7], $none['days'][28]);
        $this->assertSame(['date' => self::TODAY, 'calls' => 12], $none['days'][29]);
        $this->assertSame(['date' => '2026-10-14', 'calls' => 0], $none['days'][0]);

        $this->seedRun(self::HOUR_MS);
        $this->state->set('tt_paused_until_ms', (string) ($this->clock->nowMs() + self::HOUR_MS));
        $paused = $this->get('/api/admin/tt', ['days' => '14']);

        $this->assertCount(14, $paused['days']);
        $this->assertSame('2026-11-12 04:00:00', $paused['paused_until']);
        $this->assertSame(12, $paused['last_run']['tt_ok']);
        $this->assertSame('done', $paused['last_run']['stopped_by']);
    }

    public function testSecurityListsAttemptsAndTheLatestFiftyChanges(): void
    {
        $attempts = new AttemptStore($this->pdo, $this->clock);
        $attempts->record('2000', 'stranger', false);
        $attempts->record('3000', 'scripted', true);
        $audit = new AuditStore($this->pdo, $this->clock);
        for ($i = 1; $i <= 55; $i++) {
            $audit->record('channel.remove', 'login' . $i, '');
            $this->clock->advanceMs(1000);
        }
        $this->clock->advanceMs(-55_000);
        $this->seedHits(self::TODAY, 'signed_out', 3);

        $body = $this->get('/api/admin/security');

        $this->assertSame(3, $body['signed_out_today']);
        $this->assertSame(['3000', '2000'], array_column($body['attempts'], 'twitch_id'));
        $this->assertTrue($body['attempts'][0]['via_script']);
        $this->assertCount(50, $body['audit']);
        $this->assertSame('login55', $body['audit'][0]['target']);
    }

    public function testAnUnknownAdminPathIs404OnlyForTheOwner(): void
    {
        $owner = $this->call('GET', '/api/admin/nope');
        $this->assertSame(404, $owner->status);
        $this->assertSame(['error' => 'not_found'], json_decode($owner->body, true));

        $this->assertSame(401, $this->call('GET', '/api/admin/nope', [], null)->status);
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
        $this->assertSame(403, $this->call('GET', '/api/admin/nope', [], self::STRANGER_TOKEN)->status);
    }

    public function testWrongMethodIs405AfterAuthorisation(): void
    {
        $response = $this->call('POST', '/api/admin/overview');

        $this->assertSame(405, $response->status);
        $this->assertSame('GET, OPTIONS', $response->headers['Allow']);
        $this->assertSame(401, $this->call('POST', '/api/admin/overview', [], null)->status, 'not the owner: the guard answers first');
    }

    public function testNoAdminAnswerContainsTheSecretTheTokenOrTheOwnerId(): void
    {
        $this->world->grantToken(self::STRANGER_TOKEN, '2000', 'stranger', 'front');
        foreach (['session', 'overview', 'usage', 'tt', 'security', 'nope'] as $name) {
            $this->call('GET', '/api/admin/' . $name);
            $this->call('GET', '/api/admin/' . $name, [], null);
            $this->call('GET', '/api/admin/' . $name, [], self::STRANGER_TOKEN);
        }
        $this->call('OPTIONS', '/api/admin/session', [], null);

        $this->assertGreaterThanOrEqual(19, count($this->seen));
        foreach ($this->seen as $response) {
            $text = json_encode([$response->headers, $response->body]);
            foreach ([World::SECRET, self::OWNER_TOKEN, self::STRANGER_TOKEN, self::OWNER_ID, 'dbpass', 'dbuser'] as $secret) {
                $this->assertStringNotContainsString($secret, (string) $text);
            }
        }
    }
}
