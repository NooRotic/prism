<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Http\HttpResponse;
use Prism\History\Tests\Support\FakeHttp;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TrackerResult;

final class TrackerClientTest extends TestCase
{
    private const API = 'https://twitchtracker.com/api/channels/summary/';
    private const UA = 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@example.com)';
    private const SHROUD = '{"rank":217,"minutes_streamed":5658,"avg_viewers":7372,"max_viewers":14676,"hours_watched":695155,"followers":-3745,"followers_total":11292376}';

    private FakeHttp $http;
    private TrackerClient $client;

    protected function setUp(): void
    {
        $this->http = new FakeHttp();
        $this->client = new TrackerClient($this->http, self::UA);
    }

    private function answer(HttpResponse $response): void
    {
        $this->http->route('GET ' . self::API, $response);
    }

    public function testOkMapsEveryField(): void
    {
        $this->answer(FakeHttp::json(self::SHROUD));

        $result = $this->client->channelSummary('shroud');

        $this->assertSame(TrackerResult::OK, $result->kind);
        $this->assertSame(
            [
                'rank' => 217,
                'minutes_streamed' => 5658,
                'avg_viewers' => 7372,
                'max_viewers' => 14676,
                'hours_watched' => 695155,
                'followers' => -3745,
                'followers_total' => 11292376,
            ],
            $result->summary,
        );
        $this->assertNull($result->retryAfter);
    }

    public function testEmptyObjectIsUntracked(): void
    {
        $this->answer(FakeHttp::json('{}'));

        $result = $this->client->channelSummary('nobody_xyz');

        $this->assertSame(TrackerResult::UNTRACKED, $result->kind);
        $this->assertNull($result->summary);
    }

    public function testMissingOrNonNumericFieldsBecomeNullNotZero(): void
    {
        $this->answer(FakeHttp::json('{"rank":"first","avg_viewers":100,"followers":-5,"max_viewers":null,"hours_watched":"12"}'));

        $result = $this->client->channelSummary('partial');

        $this->assertSame(TrackerResult::OK, $result->kind);
        $this->assertSame(
            [
                'rank' => null,
                'minutes_streamed' => null,
                'avg_viewers' => 100,
                'max_viewers' => null,
                'hours_watched' => null,
                'followers' => -5,
                'followers_total' => null,
            ],
            $result->summary,
        );
    }

    public function testVeryLargeAndWholeFloatNumbersRoundTripAsIntegers(): void
    {
        $this->answer(FakeHttp::json('{"hours_watched":5000000000,"followers_total":11292376.0}'));

        $summary = $this->client->channelSummary('big')->summary;

        $this->assertSame(5000000000, $summary['hours_watched']);
        $this->assertSame(11292376, $summary['followers_total']);
    }

    public function testStatus429IsRateLimitedAndParsesRetryAfter(): void
    {
        $this->answer(new HttpResponse(429, '', ['retry-after' => '120']));

        $result = $this->client->channelSummary('shroud');

        $this->assertSame(TrackerResult::RATE_LIMITED, $result->kind);
        $this->assertSame(120, $result->retryAfter);
    }

    public function testStatus429WithoutRetryAfterHasNoRetryAfter(): void
    {
        $this->answer(new HttpResponse(429, ''));

        $result = $this->client->channelSummary('shroud');

        $this->assertSame(TrackerResult::RATE_LIMITED, $result->kind);
        $this->assertNull($result->retryAfter);
    }

    public function testStatus500NotFoundNetworkFailureAndInvalidJsonAreErrors(): void
    {
        foreach ([new HttpResponse(500, 'boom'), new HttpResponse(404, ''), new HttpResponse(0, ''), FakeHttp::json('<html>not json</html>')] as $response) {
            $this->answer($response);

            $result = $this->client->channelSummary('shroud');

            $this->assertSame(TrackerResult::ERROR, $result->kind);
            $this->assertNull($result->summary);
        }
    }

    public function testRequestsOnlyTheApiUrlWithLowercasedLoginAndSendsTheUserAgent(): void
    {
        $this->answer(FakeHttp::json(self::SHROUD));

        $this->client->channelSummary('ShRoUd');

        $this->assertCount(1, $this->http->requests);
        $this->assertSame('GET', $this->http->requests[0]['method']);
        $this->assertSame('https://twitchtracker.com/api/channels/summary/shroud', $this->http->requests[0]['url']);
        $this->assertSame(self::UA, $this->http->requests[0]['headers']['User-Agent']);
    }

    public function testBadLoginMakesNoRequest(): void
    {
        foreach (['a b', '../x', '', str_repeat('a', 26), 'ünï', 'a/b', 'a?b'] as $login) {
            $result = $this->client->channelSummary($login);

            $this->assertSame(TrackerResult::ERROR, $result->kind, "login: {$login}");
        }

        $this->assertSame([], $this->http->requests);
    }
}
