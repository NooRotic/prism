<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Config;
use Prism\History\Http\HttpResponse;

/**
 * A pretend Twitch and TwitchTracker behind a FakeHttp, for the tests of the visit flow, the refresh job and
 * the HTTP API. Fill in `$twitchUsers` and `$tt`; the routes answer from them as the real services would.
 */
final class World
{
    public const UA = 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@prism-tests.invalid)';
    public const SECRET = 'SECRET-xyz-never-in-output';

    public FakeHttp $http;

    /** @var array<string,array<string,mixed>> Twitch id => Helix user row */
    public array $twitchUsers = [];

    /** @var array<string,HttpResponse> lower-case login => TwitchTracker answer; unknown logins get `{}` */
    public array $tt = [];

    /** The status every Helix users request gets; anything but 200 makes Twitch look down. */
    public int $usersStatus = 200;

    /** @var list<string> logins for which the TwitchTracker route blows up with an exception, to test a run that meets a bad channel */
    public array $ttThrowsFor = [];

    /** @var array<string,array<string,mixed>> access token => the answer Twitch's validate endpoint gives for it */
    public array $tokens = [];

    /** The status Twitch's validate endpoint answers every request with; anything but 200 makes it look down. */
    public int $validateStatus = 200;

    /** When set, validate answers 200 with this raw body instead of the token's real answer (an unreadable answer). */
    public ?string $validateRawBody = null;

    public function __construct()
    {
        $this->http = new FakeHttp();
        $this->http->route('GET https://id.twitch.tv/oauth2/validate', fn (array $r): HttpResponse => $this->validate($r['headers']));
        $this->http->route('POST https://id.twitch.tv/oauth2/token', FakeHttp::json(['access_token' => 'TOKEN', 'expires_in' => 5_000_000]));
        $this->http->route('GET https://api.twitch.tv/helix/users', fn (array $r): HttpResponse => $this->users($r['url']));
        $this->http->route('GET https://api.twitch.tv/helix/channels', fn (array $r): HttpResponse => $this->channels($r['url']));
        $this->http->route('GET https://twitchtracker.com/api/channels/summary/', function (array $r): HttpResponse {
            $login = substr($r['url'], strlen('https://twitchtracker.com/api/channels/summary/'));
            if (in_array($login, $this->ttThrowsFor, true)) {
                throw new \RuntimeException('simulated failure for ' . $login);
            }

            return $this->tt[$login] ?? FakeHttp::json('{}');
        });
    }

    /** @param array<string,mixed> $extra Helix fields to override */
    public function addUser(string $id, string $login, array $extra = []): void
    {
        $this->twitchUsers[$id] = array_merge([
            'id' => $id,
            'login' => $login,
            'display_name' => ucfirst($login),
            'broadcaster_type' => 'partner',
            'description' => 'About ' . $login,
            'profile_image_url' => 'https://img.example/' . $login . '.png',
            'created_at' => '2016-12-14T20:32:28Z',
        ], $extra);
    }

    /**
     * Makes Twitch vouch for an access token. A null user id is an app token (no user). Tokens never granted get 401.
     *
     * @param list<string> $scopes
     */
    public function grantToken(string $token, ?string $userId, string $login, string $clientId, array $scopes = [], int $expiresIn = 14400): void
    {
        $answer = ['client_id' => $clientId, 'scopes' => $scopes, 'expires_in' => $expiresIn];
        if ($userId !== null) {
            $answer += ['login' => $login, 'user_id' => $userId];
        }
        $this->tokens[$token] = $answer;
    }

    /** How many times Twitch was asked to validate this token. */
    public function validationsOf(string $token): int
    {
        return count(array_filter(
            $this->http->requests,
            static fn (array $r): bool => str_starts_with($r['url'], 'https://id.twitch.tv/oauth2/validate')
                && ($r['headers']['Authorization'] ?? '') === 'OAuth ' . $token,
        ));
    }

    public function validationCalls(): int
    {
        return count($this->requestsTo('https://id.twitch.tv/oauth2/validate'));
    }

    /** @param array<string,mixed>|string $body */
    public function answerTt(string $login, array|string $body, int $status = 200, array $headers = []): void
    {
        $this->tt[$login] = FakeHttp::json($body, $status, $headers);
    }

    /** @return array<string,int|null> */
    public static function summary(int $rank = 217): array
    {
        return [
            'rank' => $rank,
            'minutes_streamed' => 5658,
            'avg_viewers' => 7372,
            'max_viewers' => 14676,
            'hours_watched' => 695155,
            'followers' => -3745,
            'followers_total' => 11292376,
        ];
    }

    /** @return list<array{method:string,url:string,headers:array<string,string>,body:?string}> */
    public function requestsTo(string $prefix): array
    {
        return array_values(array_filter($this->http->requests, static fn (array $r): bool => str_starts_with($r['url'], $prefix)));
    }

    public function ttCalls(): int
    {
        return count($this->requestsTo('https://twitchtracker.com/'));
    }

    public function twitchUserCalls(): int
    {
        return count($this->requestsTo('https://api.twitch.tv/helix/users'));
    }

    /** @param array<string,mixed> $override nested overrides merged over a valid base config */
    public static function config(array $override = []): Config
    {
        return Config::fromArray(array_replace_recursive([
            'db' => ['host' => 'dbhost', 'name' => 'dbname', 'user' => 'dbuser', 'pass' => 'dbpass'],
            'twitch' => ['client_id' => 'cid', 'client_secret' => self::SECRET],
            'allowed_origins' => ['https://prism.nooroticx.tv', 'http://localhost:5000'],
            'tt' => ['user_agent' => self::UA],
            'log_path' => sys_get_temp_dir() . '/prism-world-' . bin2hex(random_bytes(3)) . '.log',
        ], $override));
    }

    /** @param array<string,string> $headers */
    private function validate(array $headers): HttpResponse
    {
        if ($this->validateStatus !== 200) {
            return new HttpResponse($this->validateStatus, '');
        }
        if ($this->validateRawBody !== null) {
            return new HttpResponse(200, $this->validateRawBody);
        }
        $token = preg_replace('/^OAuth /', '', $headers['Authorization'] ?? '');
        if (!isset($this->tokens[$token])) {
            return FakeHttp::json(['status' => 401, 'message' => 'invalid access token'], 401);
        }

        return FakeHttp::json($this->tokens[$token]);
    }

    private function users(string $url): HttpResponse
    {
        if ($this->usersStatus !== 200) {
            return new HttpResponse($this->usersStatus, '');
        }
        $logins = array_map('strtolower', self::params($url, 'login'));
        $ids = self::params($url, 'id');
        $data = [];
        foreach ($this->twitchUsers as $id => $user) {
            if (in_array(strtolower((string) $user['login']), $logins, true) || in_array((string) $id, $ids, true)) {
                $data[] = $user;
            }
        }

        return FakeHttp::json(['data' => $data]);
    }

    private function channels(string $url): HttpResponse
    {
        $data = [];
        foreach (self::params($url, 'broadcaster_id') as $id) {
            if (isset($this->twitchUsers[$id])) {
                $data[] = ['broadcaster_id' => $id, 'broadcaster_language' => 'en', 'game_name' => 'Just Chatting'];
            }
        }

        return FakeHttp::json(['data' => $data]);
    }

    /** @return list<string> */
    private static function params(string $url, string $name): array
    {
        preg_match_all('/(?:^|[?&])' . $name . '=([^&]*)/', $url, $matches);

        return array_map('rawurldecode', $matches[1]);
    }
}
