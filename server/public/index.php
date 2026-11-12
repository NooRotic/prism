<?php

declare(strict_types=1);

// The one entry point. On the host /prism-data/public is the web root, so the config sits one level up.
ini_set('display_errors', '0'); // never print a PHP error (it would carry a file path) into an API answer

require dirname(__DIR__) . '/src/autoload.php';

use Prism\History\Api\ApiResponse;
use Prism\History\Api\Request;
use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Db;

try {
    $config = Config::load((string) (getenv('PRISM_HISTORY_CONFIG') ?: dirname(__DIR__) . '/config.php'));
    Container::router($config, Db::connect($config->db()))->handle(Request::fromGlobals())->emit();
} catch (Throwable) {
    // Nothing from the exception is shown: it could carry a path or a login.
    ApiResponse::json(500, ['error' => 'server'], ['Cache-Control' => 'no-store'])->emit();
}
