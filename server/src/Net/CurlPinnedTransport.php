<?php

declare(strict_types=1);

namespace Prism\History\Net;

/**
 * The real transport. curl is told, through CURLOPT_RESOLVE, to connect to the vetted address for the URL's host, so a
 * second DNS answer (a rebinding attack) can never send the request somewhere else. The URL is left alone, so TLS still
 * checks the certificate and the SNI against the real host name. No redirects, only http and https, and the body is
 * read only up to the limit.
 */
final class CurlPinnedTransport implements PinnedTransport
{
    private const CURLE_FILESIZE_EXCEEDED = 63;

    public function get(string $url, string $ip, int $port, int $maxBytes, int $timeoutSec, string $userAgent = '', array $requestHeaders = [], bool $probe = false): PinnedResponse
    {
        $handle = curl_init($url);
        if ($handle === false) {
            return new PinnedResponse(0, [], '', false);
        }
        $headers = [];
        $body = '';
        $truncated = false;

        $options = [
            CURLOPT_HTTPGET => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_TIMEOUT => max(1, $timeoutSec),
            CURLOPT_CONNECTTIMEOUT => max(1, min($timeoutSec, 8)),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING => '',
            CURLOPT_NOSIGNAL => true,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$headers): int {
                $colon = strpos($line, ':');
                if ($colon !== false) {
                    $headers[strtolower(trim(substr($line, 0, $colon)))] = trim(substr($line, $colon + 1));
                }

                return strlen($line);
            },
            // Counts the bytes after decompression, so a "zip bomb" cannot get past the limit either.
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body, &$truncated, $maxBytes): int {
                $room = $maxBytes - strlen($body);
                if (strlen($chunk) > $room) {
                    $body .= substr($chunk, 0, max(0, $room));
                    $truncated = true;

                    return 0; // fewer bytes than were offered: curl stops the transfer
                }
                $body .= $chunk;

                return strlen($chunk);
            },
        ];
        // A probe wants the first bytes of a body of any length: curl would refuse an announced length over the limit before
        // reading any of it, so only the write callback above cuts the body.
        if (!$probe) {
            $options[CURLOPT_MAXFILESIZE] = $maxBytes;
        }
        if ($userAgent !== '') {
            $options[CURLOPT_USERAGENT] = $userAgent;
        }
        // Only a plain token as the name and a value with no control character: a line break in either would start a header
        // of its own. Such an entry is dropped, never repaired.
        $lines = [];
        foreach ($requestHeaders as $name => $value) {
            if (preg_match('/^[A-Za-z0-9-]+$/D', (string) $name) === 1 && preg_match('/[\x00-\x1f\x7f]/', $value) !== 1) {
                $lines[] = $name . ': ' . $value;
            }
        }
        if ($lines !== []) {
            $options[CURLOPT_HTTPHEADER] = $lines;
        }
        $host = parse_url($url, PHP_URL_HOST);
        if (is_string($host) && $host !== '' && filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) === false) {
            $options[CURLOPT_RESOLVE] = [$host . ':' . $port . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip)];
        }
        curl_setopt_array($handle, $options);

        $ok = curl_exec($handle);
        $errno = curl_errno($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);

        if ($truncated || $errno === self::CURLE_FILESIZE_EXCEEDED) {
            return new PinnedResponse($status, $headers, $body, true);
        }
        if ($ok === false) {
            return new PinnedResponse(0, [], '', false);
        }

        return new PinnedResponse($status, $headers, $body, false);
    }
}
