<?php

declare(strict_types=1);

// Creates or updates the database tables: <php-cli> /prism-data/bin/install.php (on IONOS the php-cli binary is
// /usr/bin/php8.4-cli, see server/README.md). Safe to run again: it applies only the migrations not yet applied
// and prints one "applied <version>" line for each (nothing when up to date). Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $applied = Container::migrator($config, Db::connect($config->db()))->run();
} catch (Throwable $e) {
    // The class name only: a message could carry a path or a database detail.
    fwrite(STDERR, 'install failed (' . $e::class . ")\n");
    exit(1);
}

foreach ($applied as $version) {
    echo 'applied ' . $version . "\n";
}
