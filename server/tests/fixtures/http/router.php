<?php

// Router for the throwaway PHP built-in server that CurlHttpTest talks to. Not part of the service.

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

switch ($path) {
    case '/ok':
        header('Content-Type: application/json');
        header('X-Custom: Hello');
        echo json_encode([
            'method' => $_SERVER['REQUEST_METHOD'],
            'body' => file_get_contents('php://input'),
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
        break;
    case '/limited':
        http_response_code(429);
        header('Retry-After: 120');
        echo '{}';
        break;
    case '/error':
        http_response_code(500);
        echo 'boom';
        break;
    case '/redirect':
        http_response_code(302);
        header('Location: /ok');
        break;
    case '/slow':
        sleep(3);
        echo 'late';
        break;
    default:
        http_response_code(404);
        echo 'not found';
}
