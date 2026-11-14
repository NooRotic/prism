<?php

declare(strict_types=1);

// Prints a channel's numeric Twitch id: <php-cli> /prism-data/bin/twitch-id.php <login>
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md). It is how the owner finds the value for
// admin.owner_twitch_id in config.php; the id is public, not a secret. Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Db;
use Prism\History\Http\CurlHttp;
use Prism\History\Store\JobState;
use Prism\History\SystemClock;
use Prism\History\Twitch\TwitchClient;

$login = strtolower((string) ($argv[1] ?? ''));
if (preg_match('/^[a-z0-9_]{1,25}$/', $login) !== 1) {
    fwrite(STDERR, "usage: php bin/twitch-id.php <login>\n");
    exit(2);
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $clock = new SystemClock();
    $twitch = new TwitchClient(
        new CurlHttp(),
        new JobState(Db::connect($config->db()), $clock),
        $clock,
        $config->twitchClientId(),
        $config->twitchClientSecret(),
    );
    $user = $twitch->usersByLogin([$login])[$login] ?? null;
} catch (Throwable $e) {
    fwrite(STDERR, 'lookup failed (' . $e::class . ")\n");
    exit(1);
}

if ($user === null) {
    fwrite(STDERR, "not found\n");
    exit(1);
}

echo 'id=' . $user->id . "\n";
