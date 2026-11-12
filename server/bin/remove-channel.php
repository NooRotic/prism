<?php

declare(strict_types=1);

// Removes a channel on its streamer's request: <php-cli> /prism-data/bin/remove-channel.php <login>
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md).
// Deletes every channel row with that login (with its snapshots and links) and blocks it from being tracked
// again. A login nobody tracks prints zero and changes nothing. Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Db;
use Prism\History\Store\ChannelStore;
use Prism\History\SystemClock;

$login = strtolower((string) ($argv[1] ?? ''));
if (preg_match('/^[a-z0-9_]{1,25}$/', $login) !== 1) {
    fwrite(STDERR, "usage: php bin/remove-channel.php <login>\n");
    exit(2);
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $channels = new ChannelStore(Db::connect($config->db()), new SystemClock());
    $ids = $channels->idsByLogin($login);
    foreach ($ids as $id) {
        $channels->block($id, $login); // block first, so a request in between cannot track it again
        $channels->remove($id);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'remove failed (' . $e::class . ")\n");
    exit(1);
}

echo 'removed channels=' . count($ids) . ' blocked=' . count($ids) . "\n";
