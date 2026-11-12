<?php

declare(strict_types=1);

namespace Prism\History\Tracker;

use Prism\History\Http\HttpClient;
use Prism\History\Http\HttpResponse;

/**
 * TwitchTracker's documented 30-day channel summary, and nothing else: one fixed API URL, never an HTML page.
 * It does not pace or budget itself; callers go through TtGate first.
 */
final class TrackerClient
{
    private const BASE = 'https://twitchtracker.com/api/channels/summary/';
    private const FIELDS = ['rank', 'minutes_streamed', 'avg_viewers', 'max_viewers', 'hours_watched', 'followers', 'followers_total'];

    public function __construct(private HttpClient $http, private string $userAgent)
    {
    }

    public function channelSummary(string $login): TrackerResult
    {
        $login = strtolower($login);
        if (preg_match('/^[a-z0-9_]{1,25}$/', $login) !== 1) {
            return new TrackerResult(TrackerResult::ERROR);
        }

        $response = $this->http->request('GET', self::BASE . $login, [
            'User-Agent' => $this->userAgent,
            'Accept' => 'application/json',
        ]);

        if ($response->status === 429) {
            return new TrackerResult(TrackerResult::RATE_LIMITED, null, self::retryAfter($response));
        }
        if ($response->status !== 200) {
            return new TrackerResult(TrackerResult::ERROR);
        }

        $data = json_decode($response->body, true);
        if (!is_array($data)) {
            return new TrackerResult(TrackerResult::ERROR);
        }

        $summary = [];
        foreach (self::FIELDS as $field) {
            $summary[$field] = self::wholeNumberOrNull($data[$field] ?? null);
        }
        if (array_filter($summary, static fn (?int $value): bool => $value !== null) === []) {
            return new TrackerResult(TrackerResult::UNTRACKED);
        }

        return new TrackerResult(TrackerResult::OK, $summary);
    }

    /** A JSON number that is a whole number, else null: a missing or odd field is never turned into 0. */
    private static function wholeNumberOrNull(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) <= PHP_INT_MAX) {
            return (int) $value;
        }

        return null;
    }

    private static function retryAfter(HttpResponse $response): ?int
    {
        $value = $response->headers['retry-after'] ?? null;

        return $value !== null && ctype_digit($value) ? (int) $value : null;
    }
}
