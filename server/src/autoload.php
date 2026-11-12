<?php

declare(strict_types=1);

// Tiny PSR-4 loader for the namespace Prism\History\ so the runtime needs no Composer packages.
spl_autoload_register(static function (string $class): void {
    $prefix = 'Prism\\History\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $path = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($path)) {
        require $path;
    }
});
