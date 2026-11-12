<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Http\HttpResponse;
use Prism\History\Store\JobState;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeHttp;
use Prism\History\Twitch\TwitchClient;
use Prism\History\Twitch\TwitchUnavailable;

final class TwitchClientTest extends DbTestCase
{
    private const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
    private const USERS_URL = 'https://api.twitch.tv/helix/users';
    private const CHANNELS_URL = 'https://api.twitch.tv/helix/channels';
    private const SECRET = 'CLIENTSECRET-xyz';

    private FakeHttp $http;
    private JobState $state;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new FakeHttp();
        $this->state = new JobState($this->pdo, $this->clock);
    }

    private function client(): TwitchClient
    {
        return new TwitchClient($this->http, $this->state, $this->clock, 'my-client-id', self::SECRET);
    }

    private function token(string $value = 'TOKEN1', int $expiresIn = 5_000_000): HttpResponse
    {
        return FakeHttp::json(['access_token' => $value, 'expires_in' => $expiresIn, 'token_type' => 'bearer']);
    }

    /** @return array<string,mixed> */
    private function user(string $id, string $login, array $extra = []): array
    {
        return array_merge([
            'id' => $id,
            'login' => $login,
            'display_name' => ucfirst($login),
            'type' => '',
            'broadcaster_type' => 'partner',
            'description' => 'About ' . $login,
            'profile_image_url' => 'https://img.example/' . $login . '.png',
            'created_at' => '2016-12-14T20:32:28Z',
        ], $extra);
    }

    /** A helix route that knows the given users and answers only for the ones requested by `$param`. */
    private function usersRoute(string $param, array $known): void
    {
        $this->http->route('GET ' . self::USERS_URL, function (array $request) use ($param, $known): HttpResponse {
            preg_match_all('/(?:^|[?&])' . $param . '=([^&]*)/', $request['url'], $matches);
            $wanted = array_map('rawurldecode', $matches[1]);
            $data = array_values(array_filter($known, static fn (array $u): bool => in_array($u[$param === 'id' ? 'id' : 'login'], $wanted, true)));

            return FakeHttp::json(['data' => $data]);
        });
    }

    private function countParam(string $url, string $param): int
    {
        return preg_match_all('/(?:^|[?&])' . $param . '=/', $url);
    }

    /** @return list<array{method:string,url:string,headers:array<string,string>,body:?string}> */
    private function requestsTo(string $prefix): array
    {
        return array_values(array_filter($this->http->requests, static fn (array $r): bool => str_starts_with($r['url'], $prefix)));
    }

    public function testFetchesATokenOnceAndReusesIt(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', [$this->user('1', 'alice')]);
        $client = $this->client();

        $client->usersByLogin(['alice']);
        $client->usersByLogin(['alice']);

        $tokenRequests = $this->requestsTo(self::TOKEN_URL);
        $this->assertCount(1, $tokenRequests);
        $this->assertStringContainsString('grant_type=client_credentials', (string) $tokenRequests[0]['body']);
        $this->assertStringContainsString('client_id=my-client-id', (string) $tokenRequests[0]['body']);
        $this->assertStringContainsString('client_secret=' . self::SECRET, (string) $tokenRequests[0]['body']);
        $helix = $this->requestsTo(self::USERS_URL);
        $this->assertSame('Bearer TOKEN1', $helix[0]['headers']['Authorization']);
        $this->assertSame('my-client-id', $helix[0]['headers']['Client-Id']);
    }

    public function testTheTokenIsSharedThroughTheDatabaseAcrossInstances(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', [$this->user('1', 'alice')]);

        $this->client()->usersByLogin(['alice']);
        $this->client()->usersByLogin(['alice']);

        $this->assertCount(1, $this->requestsTo(self::TOKEN_URL));
    }

    public function testRefreshesATokenThatIsAboutToExpire(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, [$this->token('TOKEN1', 100), $this->token('TOKEN2', 100)]);
        $this->usersRoute('login', [$this->user('1', 'alice')]);
        $client = $this->client();

        $client->usersByLogin(['alice']);
        $this->clock->advanceMs(41_000);
        $client->usersByLogin(['alice']);

        $this->assertCount(2, $this->requestsTo(self::TOKEN_URL));
        $helix = $this->requestsTo(self::USERS_URL);
        $this->assertSame('Bearer TOKEN2', $helix[1]['headers']['Authorization']);
    }

    public function test401RefreshesOnceThenSucceeds(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, [$this->token('TOKEN1'), $this->token('TOKEN2')]);
        $this->http->route('GET ' . self::USERS_URL, [
            new HttpResponse(401, '{"error":"Unauthorized"}'),
            FakeHttp::json(['data' => [$this->user('1', 'alice')]]),
        ]);

        $users = $this->client()->usersByLogin(['alice']);

        $this->assertSame(['alice'], array_keys($users));
        $this->assertCount(2, $this->requestsTo(self::TOKEN_URL));
        $helix = $this->requestsTo(self::USERS_URL);
        $this->assertCount(2, $helix);
        $this->assertSame('Bearer TOKEN2', $helix[1]['headers']['Authorization']);
    }

    public function testASecond401ThrowsTwitchUnavailable(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, [$this->token('TOKEN1'), $this->token('TOKEN2')]);
        $this->http->route('GET ' . self::USERS_URL, new HttpResponse(401, '{"error":"Unauthorized"}'));

        try {
            $this->client()->usersByLogin(['alice']);
            $this->fail('Two 401 answers must throw');
        } catch (TwitchUnavailable) {
            $this->assertCount(2, $this->requestsTo(self::USERS_URL));
        }
    }

    public function testThe130LoginsGoInTwoRequestsOf100And30(): void
    {
        $known = [];
        $logins = [];
        for ($i = 1; $i <= 130; $i++) {
            $known[] = $this->user((string) $i, 'user' . $i);
            $logins[] = 'user' . $i;
        }
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', $known);

        $users = $this->client()->usersByLogin($logins);

        $helix = $this->requestsTo(self::USERS_URL);
        $this->assertCount(2, $helix);
        $this->assertSame(100, $this->countParam($helix[0]['url'], 'login'));
        $this->assertSame(30, $this->countParam($helix[1]['url'], 'login'));
        $this->assertCount(130, $users);
    }

    public function testLoginsAreLowercasedAndDeduplicated(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', [$this->user('1', 'alice')]);

        $users = $this->client()->usersByLogin(['Alice', 'alice', 'ALICE']);

        $this->assertSame(1, $this->countParam($this->requestsTo(self::USERS_URL)[0]['url'], 'login'));
        $this->assertSame(['alice'], array_keys($users));
    }

    public function testMissingUsersAreOmitted(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', [$this->user('1', 'alice')]);

        $users = $this->client()->usersByLogin(['alice', 'ghost']);

        $this->assertSame(['alice'], array_keys($users));
    }

    public function testEmptyInputMakesNoRequests(): void
    {
        $client = $this->client();

        $this->assertSame([], $client->usersByLogin([]));
        $this->assertSame([], $client->usersById([]));
        $this->assertSame([], $client->channelsById([]));
        $this->assertSame([], $this->http->requests);
    }

    public function testMapsUserFieldsAndConvertsCreatedAtToUtcDatetime(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('login', [
            $this->user('141981764', 'twitchdev', ['broadcaster_type' => 'affiliate']),
            $this->user('2', 'noavatar', ['profile_image_url' => '', 'broadcaster_type' => '']),
        ]);

        $users = $this->client()->usersByLogin(['twitchdev', 'noavatar']);

        $dev = $users['twitchdev'];
        $this->assertSame('141981764', $dev->id);
        $this->assertSame('twitchdev', $dev->login);
        $this->assertSame('Twitchdev', $dev->displayName);
        $this->assertSame('https://img.example/twitchdev.png', $dev->avatarUrl);
        $this->assertSame('affiliate', $dev->broadcasterType);
        $this->assertSame('2016-12-14 20:32:28', $dev->createdAt);
        $this->assertSame('About twitchdev', $dev->description);
        $this->assertNull($users['noavatar']->avatarUrl);
        $this->assertSame('', $users['noavatar']->broadcasterType);
    }

    public function testUsersByIdUsesTheIdParameterAndKeysByIdWithTheCurrentLogin(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->usersRoute('id', [$this->user('141981764', 'renamed_login')]);

        $users = $this->client()->usersById(['141981764']);

        $this->assertSame(1, $this->countParam($this->requestsTo(self::USERS_URL)[0]['url'], 'id'));
        $this->assertSame('renamed_login', $users['141981764']->login);
    }

    public function testChannelsByIdMapsLanguageAndCategory(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->http->route('GET ' . self::CHANNELS_URL, FakeHttp::json(['data' => [
            ['broadcaster_id' => '1', 'broadcaster_language' => 'en', 'game_name' => 'Just Chatting'],
            ['broadcaster_id' => '2', 'broadcaster_language' => '', 'game_name' => ''],
        ]]));

        $channels = $this->client()->channelsById(['1', '2']);

        $request = $this->requestsTo(self::CHANNELS_URL)[0];
        $this->assertSame(2, $this->countParam($request['url'], 'broadcaster_id'));
        $this->assertSame('en', $channels['1']->language);
        $this->assertSame('Just Chatting', $channels['1']->category);
        $this->assertNull($channels['2']->language);
        $this->assertNull($channels['2']->category);
    }

    public function testChannelsAreBatchedBy100(): void
    {
        $ids = array_map('strval', range(1, 101));
        $this->http->route('POST ' . self::TOKEN_URL, $this->token());
        $this->http->route('GET ' . self::CHANNELS_URL, FakeHttp::json(['data' => []]));

        $this->client()->channelsById($ids);

        $requests = $this->requestsTo(self::CHANNELS_URL);
        $this->assertCount(2, $requests);
        $this->assertSame(100, $this->countParam($requests[0]['url'], 'broadcaster_id'));
        $this->assertSame(1, $this->countParam($requests[1]['url'], 'broadcaster_id'));
    }

    public function testServerErrorsAndNetworkFailureThrowTwitchUnavailable(): void
    {
        foreach ([503, 429, 0] as $status) {
            $this->state->delete('twitch_token');
            $this->http = new FakeHttp([
                'POST ' . self::TOKEN_URL => $this->token(),
                'GET ' . self::USERS_URL => new HttpResponse($status, ''),
            ]);

            try {
                $this->client()->usersByLogin(['alice']);
                $this->fail("Status {$status} must throw");
            } catch (TwitchUnavailable) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testATokenRequestFailureThrowsAndMakesNoHelixRequest(): void
    {
        $this->http->route('POST ' . self::TOKEN_URL, new HttpResponse(500, 'oops'));

        try {
            $this->client()->usersByLogin(['alice']);
            $this->fail('A failed token request must throw');
        } catch (TwitchUnavailable) {
            $this->assertSame([], $this->requestsTo(self::USERS_URL));
        }
    }

    public function testNoExceptionMessageContainsTheSecretOrTheToken(): void
    {
        $scenarios = [
            [new HttpResponse(500, 'oops ' . self::SECRET), null],
            [$this->token('TOKEN1'), new HttpResponse(500, 'TOKEN1 ' . self::SECRET)],
            [$this->token('TOKEN1'), new HttpResponse(401, 'TOKEN1')],
        ];

        foreach ($scenarios as [$tokenAnswer, $usersAnswer]) {
            $this->state->delete('twitch_token');
            $routes = ['POST ' . self::TOKEN_URL => $tokenAnswer];
            if ($usersAnswer !== null) {
                $routes['GET ' . self::USERS_URL] = $usersAnswer;
            }
            $this->http = new FakeHttp($routes);

            try {
                $this->client()->usersByLogin(['alice']);
                $this->fail('Each scenario must throw');
            } catch (TwitchUnavailable $e) {
                $this->assertStringNotContainsString(self::SECRET, $e->getMessage());
                $this->assertStringNotContainsString('TOKEN1', $e->getMessage());
            }
        }
    }
}
