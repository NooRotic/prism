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
    public const UA = 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@example.com)';
    public const SECRET = 'SECRET-xyz-never-in-output';

    public FakeHttp $http;

    /** @var array<string,array<string,mixed>> Twitch id => Helix user row */
    public array $twitchUsers = [];

    /** @var array<string,HttpResponse> lower-case login => TwitchTracker answer; unknown logins get `{}` */
    public array $tt = [];

    /** The status every Helix users request gets; anything but 200 makes Twitch look down. */
    public int $usersStatus = 200;

    public function __construct()
    {
        $this->http = new FakeHttp();
        $this->http->route('POST https://id.twitch.tv/oauth2/token', FakeHttp::json(['access_token' => 'TOKEN', 'expires_in' => 5_000_000]));
        $this->http->route('GET https://api.twitch.tv/helix/users', fn (array $r): HttpResponse => $this->users($r['url']));
        $this->http->route('GET https://api.twitch.tv/helix/channels', fn (array $r): HttpResponse => $this->channels($r['url']));
        $this->http->route('GET https://twitchtracker.com/api/channels/summary/', fn (array $r): HttpResponse => $this->tt[substr($r['url'], strlen('https://twitchtracker.com/api/channels/summary/'))] ?? FakeHttp::json('{}'));
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
