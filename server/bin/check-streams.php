<?php

declare(strict_types=1);

// The stream checker, run by cron: <php-cli> /prism-data/bin/check-streams.php [--first-pass] [--limit=<1 to 2000>]
// (on IONOS the php-cli binary is /usr/bin/php8.4-cli, see server/README.md). One launch at a time (a named database lock; a
// second launch exits quietly). With checker.workers above 1 it starts that many bin/check-worker.php processes, each owning
// the streams whose host falls in its slice, and waits for them; if processes cannot be started it runs one worker over
// everything. --first-pass keeps going until nothing is due instead of taking one batch. It prints counts and fixed words only.
//
//   --pause / --resume   the kill switch: a paused checker does nothing until resumed
//   --status             mode (shadow until the owner applies the first pass, then live), paused or not, first-pass progress
//
// Command line only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;
use Prism\History\RunLock;

const USAGE = "usage: php bin/check-streams.php [--first-pass] [--limit=<1 to 2000>] | --pause | --resume | --status\n";

$firstPass = false;
$limit = null;
$control = null;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--first-pass') {
        $firstPass = true;
    } elseif (preg_match('/^--limit=([0-9]{1,4})$/D', $arg, $m) === 1 && (int) $m[1] >= 1 && (int) $m[1] <= 2000) {
        $limit = (int) $m[1];
    } elseif (in_array($arg, ['--pause', '--resume', '--status'], true) && $control === null) {
        $control = substr($arg, 2);
    } else {
        fwrite(STDERR, USAGE);
        exit(2);
    }
}
if ($control !== null && ($firstPass || $limit !== null)) {
    fwrite(STDERR, USAGE);
    exit(2);
}

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $pdo = Db::connect($config->db());

    if ($control !== null) {
        $state = Container::checkerState($config, $pdo);
        if ($control === 'pause' || $control === 'resume') {
            $state->setPaused($control === 'pause');
            echo $control === 'pause' ? "paused\n" : "resumed\n";
        } else {
            $progress = Container::streamStore($config, $pdo)->firstPass();
            echo 'mode=' . ($state->appliedAt() === null ? 'shadow' : 'live') . ' paused=' . ($state->isPaused() ? '1' : '0')
                . ' checked=' . $progress['checked'] . ' eligible=' . $progress['eligible'] . "\n";
        }
        exit(0);
    }

    $lock = new RunLock($pdo, RunLock::CHECKER);
    if (!$lock->acquire()) {
        echo "skipped (another run is active)\n";
        exit(0);
    }
    try {
        $batch = $limit ?? $config->checkerBatch();
        $workers = $config->checkerWorkers();
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if ($workers > 1 && (!function_exists('proc_open') || in_array('proc_open', $disabled, true))) {
            $workers = 1;
        }

        $totals = ['checked' => 0, 'passed' => 0, 'failed' => 0, 'guarded' => 0, 'voided' => 0, 'bytes' => 0];
        $stopped = null;
        if ($workers === 1) {
            $r = Container::checkWorker($config, $pdo)->run(0, 1, $batch, $firstPass);
            foreach (array_keys($totals) as $key) {
                $totals[$key] = $r[$key];
            }
            $stopped = $r['stopped'];
        } else {
            $children = [];
            for ($k = 0; $k < $workers; $k++) {
                $command = [PHP_BINARY, __DIR__ . '/check-worker.php', $k . '/' . $workers, '--limit=' . $batch];
                if ($firstPass) {
                    $command[] = '--first-pass';
                }
                $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
                if (!is_resource($process)) {
                    throw new RuntimeException('worker not started');
                }
                $children[] = [$process, $pipes];
            }
            $failed = false;
            foreach ($children as [$process, $pipes]) {
                $out = (string) stream_get_contents($pipes[1]);
                stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $code = proc_close($process);
                $pattern = '/^checked=(\d+) passed=(\d+) failed=(\d+) guarded=(\d+) voided=(\d+) bytes=(\d+)(?: stopped=([a-z_]+))?$/m';
                if ($code !== 0 || preg_match($pattern, $out, $m) !== 1) {
                    $failed = true;
                    continue;
                }
                foreach (array_keys($totals) as $i => $key) {
                    $totals[$key] += (int) $m[$i + 1];
                }
                $stopped ??= $m[7] ?? null;
            }
            if ($failed) {
                throw new RuntimeException('a worker failed');
            }
        }
    } finally {
        $lock->release();
    }
} catch (Throwable) {
    // Only the fact of the failure is printed: a message could carry a path, an address or a database detail.
    fwrite(STDERR, "check failed\n");
    exit(1);
}

echo 'workers=' . $workers . ' checked=' . $totals['checked'] . ' passed=' . $totals['passed'] . ' failed=' . $totals['failed']
    . ' guarded=' . $totals['guarded'] . ' voided=' . $totals['voided'] . ' bytes=' . $totals['bytes']
    . ($stopped !== null ? ' stopped=' . $stopped : '') . "\n";
