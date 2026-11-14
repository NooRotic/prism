<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

use Prism\History\Http\HttpClient;

/**
 * Asks Twitch who an access token belongs to (GET id.twitch.tv/oauth2/validate). The token is sent to Twitch and
 * nowhere else; failures throw TwitchUnavailable with a status code only, never the token or Twitch's body.
 */
final class TokenValidator
{
    private const URL = 'https://id.twitch.tv/oauth2/validate';

    public function __construct(private HttpClient $http)
    {
    }

    /**
     * @return TokenInfo|null null when Twitch says the token is not valid (a 401), or when it is an app token with no user
     * @throws TwitchUnavailable when Twitch cannot be asked or its answer cannot be read
     */
    public function validate(string $token): ?TokenInfo
    {
        $response = $this->http->request('GET', self::URL, ['Authorization' => 'OAuth ' . $token, 'Accept' => 'application/json']);
        if ($response->status === 401) {
            return null;
        }
        if ($response->status !== 200) {
            throw new TwitchUnavailable('Twitch answered the token check with status ' . $response->status);
        }

        $data = json_decode($response->body, true);
        if (!is_array($data) || !is_string($data['client_id'] ?? null)) {
            throw new TwitchUnavailable('Twitch sent an unreadable token check answer');
        }
        $userId = $data['user_id'] ?? null;
        if (!is_string($userId) || $userId === '') {
            return null; // an app token (client credentials) belongs to no user, so it cannot be the owner's
        }

        $scopes = [];
        foreach (is_array($data['scopes'] ?? null) ? $data['scopes'] : [] as $scope) {
            if (is_string($scope)) {
                $scopes[] = $scope;
            }
        }

        return new TokenInfo(
            $data['client_id'],
            $userId,
            is_string($data['login'] ?? null) ? $data['login'] : '',
            $scopes,
            is_int($data['expires_in'] ?? null) ? max(0, $data['expires_in']) : 0,
        );
    }
}
