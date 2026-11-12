<?php

declare(strict_types=1);

// One-time installer for a host with no shell. NOT part of the deploy: it is generated at rollout.
//   1. Replace the placeholder in the const below with a long random token (at least 16 characters).
//   2. Upload the result as /prism-data/public/install-<random>.php.
//   3. Open it once as ...?t=<token>, read the "applied" lines, then DELETE the file.
// Until the placeholder is replaced it refuses every request.

const INSTALL_TOKEN = '__TOKEN__';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$given = $_GET['t'] ?? '';
// The placeholder is written in two pieces here so that filling in the const above cannot rewrite this check.
if (INSTALL_TOKEN === '__TOK' . 'EN__' || strlen(INSTALL_TOKEN) < 16 || !is_string($given) || !hash_equals(INSTALL_TOKEN, $given)) {
    http_response_code(403);
    exit;
}

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    $applied = Container::migrator($config, Db::connect($config->db()))->run();
} catch (Throwable) {
    http_response_code(500);
    echo "install failed\n";
    exit;
}

foreach ($applied as $version) {
    echo 'applied ' . $version . "\n";
}
echo "done\n";
