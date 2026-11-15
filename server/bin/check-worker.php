<?php

declare(strict_types=1);

// One stream-checker worker: <php-cli> /prism-data/bin/check-worker.php <slice>/<of> [--first-pass] [--limit=<1 to 2000>]
// It checks the streams whose host falls in its slice (slice 0 to of-1, of 1 to 12) and prints one line of counts. The launcher,
// bin/check-streams.php, starts one of these per configured worker; run by hand it is for testing one slice. It takes no lock:
// the launcher holds it. Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

const USAGE = "usage: php bin/check-worker.php <slice>/<of> [--first-pass] [--limit=<1 to 2000>]\n";

$slice = null;
$firstPass = false;
$limit = null;
foreach (array_slice($argv, 1) as $arg) {
    if ($slice === null && preg_match('#^([0-9]{1,2})/([0-9]{1,2})$#D', $arg, $m) === 1) {
        $slice = [(int) $m[1], (int) $m[2]];
    } elseif ($arg === '--first-pass') {
        $firstPass = true;
    } elseif (preg_match('/^--limit=([0-9]{1,4})$/D', $arg, $m) === 1 && (int) $m[1] >= 1 && (int) $m[1] <= 2000) {
        $limit = (int) $m[1];
    } else {
        fwrite(STDERR, USAGE);
        exit(2);
    }
}
if ($slice === null || $slice[1] < 1 || $slice[1] > 12 || $slice[0] >= $slice[1]) {
    fwrite(STDERR, USAGE);
    exit(2);
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $pdo = Db::connect($config->db());
    $r = Container::checkWorker($config, $pdo)->run($slice[0], $slice[1], $limit ?? $config->checkerBatch(), $firstPass);
} catch (Throwable) {
    // Only the fact of the failure is printed: a message could carry a path, an address or a database detail.
    fwrite(STDERR, "check failed\n");
    exit(1);
}

echo 'checked=' . $r['checked'] . ' passed=' . $r['passed'] . ' failed=' . $r['failed'] . ' guarded=' . $r['guarded']
    . ' voided=' . $r['voided'] . ' bytes=' . $r['bytes'] . ($r['stopped'] !== null ? ' stopped=' . $r['stopped'] : '') . "\n";
