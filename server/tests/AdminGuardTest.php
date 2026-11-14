<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PDO;
use Prism\History\Admin\AdminDecision;
use Prism\History\Admin\AdminGuard;
use Prism\History\Admin\TokenCache;
use Prism\History\Api\Request;
use Prism\History\RateCap;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\JobState;
use Prism\History\Store\UsageCounters;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\World;
use Prism\History\Twitch\TokenValidator;

final class AdminGuardTest extends DbTestCase
{
    private const OWNER_TOKEN = 'ownertoken0123456789ownertoken';
    private const OTHER_TOKEN = 'strangertoken012345678strangerx';
    private const DAY = '2026-11-12';

    private World $world;

    protected function setUp(): void
    {
        parent::setUp();
        $this->world = new World();
    }

    /** @param array<string,mixed> $override */
    private function guard(array $override = ['admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front']]): AdminGuard
    {
        return new AdminGuard(
            World::config($override),
            new TokenValidator($this->world->http),
            new TokenCache($this->pdo, $this->clock),
            new AttemptStore($this->pdo, $this->clock),
            new UsageCounters($this->pdo, $this->clock),
            new RateCap(new JobState($this->pdo, $this->clock), $this->clock),
            $this->clock,
        );
    }

    private function request(?string $token): Request
    {
        return new Request('GET', '/api/admin/session', [], null, '', $token === null ? null : 'Bearer ' . $token);
    }

    private function signedOutToday(): int
    {
        return (new UsageCounters($this->pdo, $this->clock))->valueOn(self::DAY, 'signed_out');
    }

    private function rowCount(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    public function testInactiveConfigIsNotFoundWithNoTwitchCall(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');
        $configs = [
            [],
            ['admin' => ['owner_twitch_id' => '1000']],
            ['admin' => ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front', 'enabled' => false]],
        ];
        foreach ($configs as $override) {
            $decision = $this->guard($override)->authorize($this->request(self::OWNER_TOKEN));

            $this->assertSame(AdminDecision::NOT_FOUND, $decision->kind);
        }
        $this->assertSame(0, $this->world->validationCalls());
        $this->assertSame(0, $this->signedOutToday());
        $this->assertSame(0, $this->rowCount('admin_attempts'));
    }

    public function testMissingAndMisshapenTokensAreSignedOutCountedWithNoTwitchCall(): void
    {
        $guard = $this->guard();
        $tokens = [null, 'short', 'has-a-dash-aaaaaaaaaaaaaaaaaaaaaa', str_repeat('a', 65), str_repeat('a', 19)];

        foreach ($tokens as $token) {
            $this->assertSame(AdminDecision::SIGNED_OUT, $guard->authorize($this->request($token))->kind, (string) $token);
        }
        $this->assertSame(0, $this->world->validationCalls());
        $this->assertSame(count($tokens), $this->signedOutToday());
        $this->assertSame(0, $this->rowCount('admin_attempts'));
    }

    public function testTheOwnersPermissionlessTokenIsAcceptedAndCached(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');

        $decision = $this->guard()->authorize($this->request(self::OWNER_TOKEN));

        $this->assertSame(AdminDecision::OWNER, $decision->kind);
        $this->assertFalse($decision->recorded);
        $this->assertSame(1, $this->world->validationsOf(self::OWNER_TOKEN));
        $this->assertSame(1, $this->rowCount('admin_token_cache'));
        $this->assertSame(0, $this->rowCount('admin_attempts'));
        $this->assertSame(0, $this->signedOutToday());
    }

    public function testACachedTokenNeedsNoTwitchCall(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');
        $guard = $this->guard();

        $guard->authorize($this->request(self::OWNER_TOKEN));
        $second = $guard->authorize($this->request(self::OWNER_TOKEN));

        $this->assertSame(AdminDecision::OWNER, $second->kind);
        $this->assertSame(1, $this->world->validationsOf(self::OWNER_TOKEN));
    }

    public function testTheCacheHonoursExpiry(): void
    {
        $short = 'shortlived0123456789shortlived';
        $long = 'longlived01234567890longlivedx';
        $this->world->grantToken($short, '1000', 'owner', 'front', [], 60);
        $this->world->grantToken($long, '1000', 'owner', 'front', [], 99_999);
        $guard = $this->guard();

        $guard->authorize($this->request($short));
        $guard->authorize($this->request($long));
        $this->clock->advanceMs(59_000);
        $guard->authorize($this->request($short));
        $this->assertSame(1, $this->world->validationsOf($short), 'still cached at 59 seconds');

        $this->clock->advanceMs(2_000);
        $guard->authorize($this->request($short));
        $this->assertSame(2, $this->world->validationsOf($short), 'asked again after the token\'s own life');

        $this->clock->advanceMs(29 * 60_000 - 61_000);
        $guard->authorize($this->request($long));
        $this->assertSame(1, $this->world->validationsOf($long), 'a long token is cached 30 minutes');

        $this->clock->advanceMs(2 * 60_000);
        $guard->authorize($this->request($long));
        $this->assertSame(2, $this->world->validationsOf($long), 'but never longer than 30 minutes');
    }

    public function testTwitchSaying401IsSignedOut(): void
    {
        $decision = $this->guard()->authorize($this->request(self::OTHER_TOKEN));

        $this->assertSame(AdminDecision::SIGNED_OUT, $decision->kind);
        $this->assertSame(1, $this->signedOutToday());
        $this->assertSame(1, $this->world->validationCalls());
        $this->assertSame(0, $this->rowCount('admin_attempts'));
    }

    public function testATwitchOutageIsUnavailableAndRecordsNothing(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');
        $this->world->validateStatus = 503;
        $this->assertSame(AdminDecision::UNAVAILABLE, $this->guard()->authorize($this->request(self::OWNER_TOKEN))->kind);

        $this->world->validateStatus = 200;
        $this->world->validateRawBody = 'garbage';
        $this->assertSame(AdminDecision::UNAVAILABLE, $this->guard()->authorize($this->request(self::OTHER_TOKEN))->kind);

        $this->assertSame(0, $this->signedOutToday());
        $this->assertSame(0, $this->rowCount('admin_attempts'));
        $this->assertSame(0, $this->rowCount('admin_token_cache'));
    }

    public function testTheValidationCapAnswersBusyButACachedOwnerStillPasses(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');
        $guard = $this->guard();
        $this->assertSame(AdminDecision::OWNER, $guard->authorize($this->request(self::OWNER_TOKEN))->kind); // validation 1 of 30
        for ($i = 2; $i <= 30; $i++) {
            $this->assertSame(AdminDecision::SIGNED_OUT, $guard->authorize($this->request(sprintf('fake%026d', $i)))->kind);
        }
        $callsAtTheCap = $this->world->validationCalls();

        $busy = $guard->authorize($this->request(sprintf('fake%026d', 31)));

        $this->assertSame(AdminDecision::BUSY, $busy->kind);
        $this->assertSame($callsAtTheCap, $this->world->validationCalls(), 'no Twitch call once the cap is spent');
        $this->assertSame(AdminDecision::OWNER, $guard->authorize($this->request(self::OWNER_TOKEN))->kind, 'the cached owner is never throttled');

        $this->clock->advanceMs(60_000);
        $this->assertSame(AdminDecision::SIGNED_OUT, $guard->authorize($this->request(sprintf('fake%026d', 32)))->kind, 'the next minute starts again');
    }

    public function testANonOwnerThroughTheAdminSignInIsRefusedAndNamedNotFlagged(): void
    {
        $this->world->grantToken(self::OTHER_TOKEN, '2000', 'Stranger', 'front');

        $decision = $this->guard()->authorize($this->request(self::OTHER_TOKEN));

        $this->assertSame(AdminDecision::REFUSED, $decision->kind);
        $this->assertTrue($decision->recorded);
        $rows = (new AttemptStore($this->pdo, $this->clock))->recent();
        $this->assertCount(1, $rows);
        $this->assertSame('2000', $rows[0]['twitch_id']);
        $this->assertSame('Stranger', $rows[0]['login']);
        $this->assertFalse($rows[0]['via_script']);
        $this->assertSame(0, $this->rowCount('admin_token_cache'), 'a refused token is never cached');
    }

    public function testAViewerTokenWithScopesIsRefusedNamedAndFlagged(): void
    {
        $this->world->grantToken(self::OTHER_TOKEN, '2000', 'stranger', 'front', ['user:read:follows', 'bits:read']);

        $decision = $this->guard()->authorize($this->request(self::OTHER_TOKEN));

        $this->assertSame(AdminDecision::REFUSED, $decision->kind);
        $this->assertTrue($decision->recorded);
        $this->assertTrue((new AttemptStore($this->pdo, $this->clock))->recent()[0]['via_script']);
    }

    public function testAForeignClientIdIsRefusedNamedAndFlagged(): void
    {
        $this->world->grantToken(self::OTHER_TOKEN, '2000', 'stranger', 'someone-elses-app');

        $decision = $this->guard()->authorize($this->request(self::OTHER_TOKEN));

        $this->assertSame(AdminDecision::REFUSED, $decision->kind);
        $this->assertTrue($decision->recorded);
        $this->assertTrue((new AttemptStore($this->pdo, $this->clock))->recent()[0]['via_script']);
    }

    public function testTheOwnersOwnWrongKindOfTokenIsRefusedButNotLogged(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front', ['user:read:follows']);
        $this->world->grantToken(self::OTHER_TOKEN, '1000', 'owner', 'another-app');

        foreach ([self::OWNER_TOKEN, self::OTHER_TOKEN] as $token) {
            $decision = $this->guard()->authorize($this->request($token));

            $this->assertSame(AdminDecision::REFUSED, $decision->kind);
            $this->assertFalse($decision->recorded);
        }
        $this->assertSame(0, $this->rowCount('admin_attempts'));
        $this->assertSame(0, $this->rowCount('admin_token_cache'));
    }

    public function testTheLoggedNameComesFromTwitchsAnswer(): void
    {
        $this->world->grantToken(self::OTHER_TOKEN, '2000', 'ExactlyAsTwitchSaysIt', 'front');

        $this->guard()->authorize($this->request(self::OTHER_TOKEN));

        $this->assertSame('ExactlyAsTwitchSaysIt', (new AttemptStore($this->pdo, $this->clock))->recent()[0]['login']);
    }

    public function testNothingRecordedContainsTheToken(): void
    {
        $this->world->grantToken(self::OWNER_TOKEN, '1000', 'owner', 'front');
        $this->world->grantToken(self::OTHER_TOKEN, '2000', 'stranger', 'front');
        $guard = $this->guard();
        $guard->authorize($this->request(self::OWNER_TOKEN));
        $guard->authorize($this->request(self::OTHER_TOKEN));
        $guard->authorize($this->request('unknowntoken01234567890unknown'));

        $dump = '';
        foreach (['usage_counters', 'admin_attempts', 'admin_audit', 'admin_token_cache', 'job_state'] as $table) {
            $dump .= json_encode($this->pdo->query("SELECT * FROM {$table}")->fetchAll(PDO::FETCH_ASSOC));
        }

        foreach ([self::OWNER_TOKEN, self::OTHER_TOKEN, 'unknowntoken01234567890unknown'] as $token) {
            $this->assertStringNotContainsString($token, $dump);
        }
        $this->assertStringContainsString(hash('sha256', self::OWNER_TOKEN), $dump, 'the cache holds a hash');
    }
}
