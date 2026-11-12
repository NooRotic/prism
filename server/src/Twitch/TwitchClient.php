<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

use DateTimeImmutable;
use DateTimeZone;
use Exception;
use Prism\History\Clock;
use Prism\History\Http\HttpClient;
use Prism\History\Store\JobState;

/**
 * The few Helix reads the service needs, with an app access token (client credentials) cached in the database
 * until it is about to expire. Requests go in batches of 100. Failures throw TwitchUnavailable with a message
 * made of status codes only: a response body, the client secret and the token never reach an exception.
 */
final class TwitchClient
{
    private const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
    private const API = 'https://api.twitch.tv/helix/';
    private const TOKEN_KEY = 'twitch_token';
    private const BATCH = 100;
    private const REFRESH_MARGIN_MS = 60_000;

    public function __construct(
        private HttpClient $http,
        private JobState $state,
        private Clock $clock,
        private string $clientId,
        private string $clientSecret,
    ) {
    }

    /**
     * @param list<string> $logins any number; case does not matter
     * @return array<string,TwitchUser> the users that exist, keyed by lower-case login
     */
    public function usersByLogin(array $logins): array
    {
        $logins = array_values(array_unique(array_map(static fn ($l): string => strtolower((string) $l), $logins)));
        $users = [];
        foreach ($this->fetch('users', 'login', $logins) as $row) {
            $user = self::user($row);
            $users[$user->login] = $user;
        }

        return $users;
    }

    /**
     * @param list<string> $ids
     * @return array<string,TwitchUser> keyed by Twitch id; the login is the account's current one
     */
    public function usersById(array $ids): array
    {
        $users = [];
        foreach ($this->fetch('users', 'id', self::unique($ids)) as $row) {
            $user = self::user($row);
            $users[$user->id] = $user;
        }

        return $users;
    }

    /**
     * @param list<string> $ids
     * @return array<string,TwitchChannelInfo> keyed by Twitch id
     */
    public function channelsById(array $ids): array
    {
        $channels = [];
        foreach ($this->fetch('channels', 'broadcaster_id', self::unique($ids)) as $row) {
            $id = (string) ($row['broadcaster_id'] ?? '');
            if ($id === '') {
                continue;
            }
            $channels[$id] = new TwitchChannelInfo(
                $id,
                self::textOrNull($row['broadcaster_language'] ?? null),
                self::textOrNull($row['game_name'] ?? null),
            );
        }

        return $channels;
    }

    /**
     * @param list<string> $values
     * @return list<array<string,mixed>>
     */
    private function fetch(string $endpoint, string $param, array $values): array
    {
        $rows = [];
        foreach (array_chunk($values, self::BATCH) as $batch) {
            $query = implode('&', array_map(static fn (string $v): string => $param . '=' . rawurlencode($v), $batch));
            $body = $this->authorizedGet(self::API . $endpoint . '?' . $query);
            foreach ($body['data'] ?? [] as $row) {
                if (is_array($row)) {
                    $rows[] = $row;
                }
            }
        }

        return $rows;
    }

    /** @return array<string,mixed> */
    private function authorizedGet(string $url): array
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $response = $this->http->request('GET', $url, [
                'Authorization' => 'Bearer ' . $this->token($attempt === 1),
                'Client-Id' => $this->clientId,
                'Accept' => 'application/json',
            ]);
            if ($response->status === 401) {
                continue; // the first 401 gets one fresh token and a retry
            }
            if ($response->status !== 200) {
                throw new TwitchUnavailable('Twitch answered with status ' . $response->status);
            }
            $decoded = json_decode($response->body, true);
            if (!is_array($decoded)) {
                throw new TwitchUnavailable('Twitch sent an unreadable answer');
            }

            return $decoded;
        }

        throw new TwitchUnavailable('Twitch rejected the app token');
    }

    private function token(bool $forceNew): string
    {
        if (!$forceNew) {
            $cached = json_decode($this->state->get(self::TOKEN_KEY) ?? '', true);
            if (
                is_array($cached)
                && is_string($cached['access_token'] ?? null)
                && is_int($cached['expires_at_ms'] ?? null)
                && $cached['expires_at_ms'] - self::REFRESH_MARGIN_MS > $this->clock->nowMs()
            ) {
                return $cached['access_token'];
            }
        }

        $response = $this->http->request(
            'POST',
            self::TOKEN_URL,
            ['Content-Type' => 'application/x-www-form-urlencoded', 'Accept' => 'application/json'],
            http_build_query([
                'client_id' => $this->clientId,
                'client_secret' => $this->clientSecret,
                'grant_type' => 'client_credentials',
            ]),
        );
        if ($response->status !== 200) {
            throw new TwitchUnavailable('Twitch token request failed with status ' . $response->status);
        }
        $data = json_decode($response->body, true);
        if (!is_array($data) || !is_string($data['access_token'] ?? null) || $data['access_token'] === '') {
            throw new TwitchUnavailable('Twitch token request returned no token');
        }
        $expiresIn = is_int($data['expires_in'] ?? null) ? $data['expires_in'] : 3600;
        $this->state->set(self::TOKEN_KEY, json_encode([
            'access_token' => $data['access_token'],
            'expires_at_ms' => $this->clock->nowMs() + $expiresIn * 1000,
        ], JSON_THROW_ON_ERROR));

        return $data['access_token'];
    }

    /** @param array<string,mixed> $row */
    private static function user(array $row): TwitchUser
    {
        $login = strtolower((string) ($row['login'] ?? ''));

        return new TwitchUser(
            (string) ($row['id'] ?? ''),
            $login,
            (string) ($row['display_name'] ?? $login),
            self::textOrNull($row['profile_image_url'] ?? null),
            (string) ($row['broadcaster_type'] ?? ''),
            self::utcDatetime($row['created_at'] ?? null),
            (string) ($row['description'] ?? ''),
        );
    }

    private static function textOrNull(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function utcDatetime(mixed $iso): ?string
    {
        if (!is_string($iso) || $iso === '') {
            return null;
        }
        try {
            return (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception) {
            return null;
        }
    }

    /**
     * @param list<string> $values
     * @return list<string>
     */
    private static function unique(array $values): array
    {
        return array_values(array_unique(array_map(static fn ($v): string => (string) $v, $values)));
    }
}
