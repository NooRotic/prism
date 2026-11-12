<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/autoload.php';

// Test helpers live in the namespace Prism\History\Tests\ under tests/ (for example Support\DbTestCase).
spl_autoload_register(static function (string $class): void {
    $prefix = 'Prism\\History\\Tests\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $path = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($path)) {
        require $path;
    }
});
