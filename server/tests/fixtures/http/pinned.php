<?php

// Router for the throwaway PHP built-in server that CurlPinnedTransportTest talks to. Not part of the service.

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

switch ($path) {
    case '/echo':
        header('Content-Type: application/json');
        header('X-Custom: Hello');
        echo json_encode([
            'host' => $_SERVER['HTTP_HOST'] ?? null,
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'method' => $_SERVER['REQUEST_METHOD'],
            'origin' => $_SERVER['HTTP_ORIGIN'] ?? null,
            'range' => $_SERVER['HTTP_RANGE'] ?? null,
            'injected' => $_SERVER['HTTP_INJECTED'] ?? null,
        ]);
        break;
    case '/big':
        header('Content-Type: image/png');
        echo str_repeat('A', 200_000);
        break;
    case '/sized':
        // A 200 KB body with its length announced up front, and Range ignored: what many video servers do.
        header('Content-Type: video/mp2t');
        header('Content-Length: 200000');
        echo str_repeat('B', 200_000);
        break;
    case '/redirect':
        http_response_code(302);
        header('Location: /echo');
        break;
    case '/slow':
        sleep(3);
        echo 'late';
        break;
    default:
        http_response_code(404);
        echo 'not found';
}
