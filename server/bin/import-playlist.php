<?php

declare(strict_types=1);

// Brings an M3U playlist into the streams table: <php-cli> /prism-data/bin/import-playlist.php <path-to-m3u> [--dry-run] [--batch=<name>]
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md). The import only ever INSERTS: a stream that is
// already known, edited or removed is left exactly as it is, so running it again is safe. It first adds PRISM's own demo
// streams, then the playlist, then rewrites the visitor snapshot. --dry-run prints the same counts and writes nothing.
// Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

const USAGE = "usage: php bin/import-playlist.php <path-to-m3u> [--dry-run] [--batch=<name>]\n";
const MAX_BYTES = 33_554_432; // 32 MiB: the real list is about 1.3 MB; anything near this is not a playlist

$path = null;
$dryRun = false;
$batch = 'import-' . gmdate('Ymd');
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    } elseif (str_starts_with($arg, '--batch=')) {
        $batch = substr($arg, strlen('--batch='));
        if (preg_match('/^[A-Za-z0-9._-]{1,60}$/D', $batch) !== 1) {
            fwrite(STDERR, USAGE);
            exit(2);
        }
    } elseif (!str_starts_with($arg, '--') && $path === null) {
        $path = $arg;
    } else {
        fwrite(STDERR, USAGE);
        exit(2);
    }
}
if ($path === null || !is_file($path) || !is_readable($path) || (int) filesize($path) > MAX_BYTES) {
    fwrite(STDERR, USAGE);
    exit(2);
}
$text = file_get_contents($path);
if ($text === false) {
    fwrite(STDERR, USAGE);
    exit(2);
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $pdo = Db::connect($config->db());
    $importer = Container::importer($config, $pdo);
    $demos = $importer->seedDemos(!$dryRun); // first, so a demo address that is also in the list stays pinned
    $counts = $importer->import($text, $batch, !$dryRun);
    $written = $dryRun ? null : Container::snapshotWriter($config, $pdo)->write();
} catch (Throwable $e) {
    // Only a class name (or our own clash message) is printed: any other message could carry a path or a database detail.
    fwrite(STDERR, 'import failed (' . ($e->getMessage() === 'public id clash' ? 'public id clash' : $e::class) . ")\n");
    exit(1);
}

foreach ($counts as $key => $value) {
    echo $key . '=' . $value . "\n";
}
echo 'demos=' . $demos . "\n";
if ($written !== null) {
    echo 'snapshot streams=' . $written['streams'] . "\n";
}
