<?php

declare(strict_types=1);

// The scheduled refresh, run by cron: <php-cli> /prism-data/bin/refresh.php. Command line only. On IONOS the
// binary is /usr/bin/php8.4-cli: plain `php` is 4.4 there and `php8.4` is the CGI build, which fails this check.
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
    $counts = Container::refreshJob($config, Db::connect($config->db()))->run();
} catch (Throwable) {
    // Only the fact of the failure is printed: a message could carry a path or a database detail.
    fwrite(STDERR, "refresh failed\n");
    exit(1);
}

echo 'refresh ' . implode(' ', array_map(static fn (string $key, int|string $value): string => $key . '=' . $value, array_keys($counts), $counts)) . "\n";
