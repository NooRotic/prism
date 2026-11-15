<?php

declare(strict_types=1);

// Moves streams that were held only because of their port, and that the checker may now contact (https on a port from 1024
// up that browsers allow), to "awaiting check": <php-cli> /prism-data/bin/rejudge-held.php [--apply]
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md). Without --apply it only prints how many it would
// move. They stay hidden from visitors until the checker's first pass has looked at them. Safe to run again. Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

$apply = false;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--apply') {
        $apply = true;
    } else {
        fwrite(STDERR, "usage: php bin/rejudge-held.php [--apply]\n");
        exit(2);
    }
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $pdo = Db::connect($config->db());
    $result = Container::heldRejudge($config, $pdo)->run($apply);
} catch (Throwable) {
    // Only the fact of the failure is printed: a message could carry a path, an address or a database detail.
    fwrite(STDERR, "rejudge failed\n");
    exit(1);
}

echo 'candidates=' . $result['candidates'] . ' moved=' . $result['moved'] . "\n";
