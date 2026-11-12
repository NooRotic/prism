<?php

declare(strict_types=1);

namespace Prism\History\Http;

/** The real transport: curl with TLS verification on, no redirects, and hard timeouts. */
final class CurlHttp implements HttpClient
{
    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSec = 10,
    ): HttpResponse {
        $handle = curl_init($url);
        if ($handle === false) {
            return new HttpResponse(0, '');
        }

        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        $responseHeaders = [];

        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => $timeoutSec,
            CURLOPT_CONNECTTIMEOUT => min($timeoutSec, 8),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
                $colon = strpos($line, ':');
                if ($colon !== false) {
                    $responseHeaders[strtolower(trim(substr($line, 0, $colon)))] = trim(substr($line, $colon + 1));
                }

                return strlen($line);
            },
        ]);
        if ($body !== null) {
            curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
        }

        $result = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);

        if ($result === false) {
            return new HttpResponse(0, '');
        }

        return new HttpResponse($status, (string) $result, $responseHeaders);
    }
}
