<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Twitch\TwitchChannelInfo;
use Prism\History\Twitch\TwitchUser;

/** Small builders for the value objects tests need over and over. */
final class Fixtures
{
    /** @param array<string,mixed> $override fields: displayName, avatarUrl, broadcasterType, createdAt, description */
    public static function user(string $id = '1', string $login = 'alice', array $override = []): TwitchUser
    {
        $d = array_merge([
            'displayName' => ucfirst($login),
            'avatarUrl' => 'https://img.example/' . $login . '.png',
            'broadcasterType' => 'partner',
            'createdAt' => '2016-12-14 20:32:28',
            'description' => 'About ' . $login,
        ], $override);

        return new TwitchUser($id, $login, $d['displayName'], $d['avatarUrl'], $d['broadcasterType'], $d['createdAt'], $d['description']);
    }

    public static function info(string $id = '1', ?string $language = 'en', ?string $category = 'Just Chatting'): TwitchChannelInfo
    {
        return new TwitchChannelInfo($id, $language, $category);
    }

    /** @return array{rank:int,minutes_streamed:int,avg_viewers:int,max_viewers:int,hours_watched:int,followers:int,followers_total:int} */
    public static function summary(): array
    {
        return [
            'rank' => 217,
            'minutes_streamed' => 5658,
            'avg_viewers' => 7372,
            'max_viewers' => 14676,
            'hours_watched' => 695155,
            'followers' => -3745,
            'followers_total' => 11292376,
        ];
    }
}
