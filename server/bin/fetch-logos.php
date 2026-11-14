<?php

declare(strict_types=1);

// Copies channel pictures for the playlist, a batch at a time: <php-cli> /prism-data/bin/fetch-logos.php [--limit=<n>]
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md). Safe to repeat and to run from cron: it only
// works on streams whose picture is still missing and gives up on one after three failed tries, it sends at most one
// request a second to any one host, and two runs never overlap. Default limit 100, at most 1000. Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;
use Prism\History\RunLock;

$limit = 100;
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--limit=([0-9]{1,4})$/D', $arg, $m) === 1 && (int) $m[1] >= 1 && (int) $m[1] <= 1000) {
        $limit = (int) $m[1];
    } else {
        fwrite(STDERR, "usage: php bin/fetch-logos.php [--limit=<1 to 1000>]\n");
        exit(2);
    }
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $pdo = Db::connect($config->db());
    $lock = new RunLock($pdo, RunLock::LOGOS);
    if (!$lock->acquire()) {
        echo "skipped (another run is active)\n";
        exit(0);
    }
    try {
        $result = Container::logoFetcher($config, $pdo)->run($limit);
    } finally {
        $lock->release();
    }
} catch (Throwable) {
    // Only the fact of the failure is printed: a message could carry a path, an address or a database detail.
    fwrite(STDERR, "fetch failed\n");
    exit(1);
}

echo 'fetched=' . $result['fetched'] . ' failed=' . $result['failed'] . "\n";
