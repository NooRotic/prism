<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;
use Prism\History\Api\Router;
use Prism\History\Http\CurlHttp;
use Prism\History\Http\HttpClient;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\JobState;
use Prism\History\Store\SnapshotStore;
use Prism\History\Tracker\Sleeper;
use Prism\History\Tracker\SystemSleeper;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TwitchClient;

/** Builds the object graph from a Config and a database connection. Tests pass a fake transport, clock and sleeper. */
final class Container
{
    public static function router(
        Config $config,
        PDO $pdo,
        ?HttpClient $http = null,
        ?Clock $clock = null,
        ?Sleeper $sleeper = null,
    ): Router {
        $clock ??= new SystemClock();
        $http ??= new CurlHttp();
        $state = new JobState($pdo, $clock);
        $channels = new ChannelStore($pdo, $clock);
        $snapshots = new SnapshotStore($pdo, $clock);
        $links = new BioLinkStore($pdo, $clock);
        $payload = new ChannelPayload($channels, $snapshots, $links, $clock);
        $gate = new TtGate(
            $pdo,
            $clock,
            $sleeper ?? new SystemSleeper(),
            $state,
            $config->ttGapMs(),
            $config->ttRunBudget(),
            $config->ttDayBudget(),
        );
        $visits = new VisitService(
            $config,
            $channels,
            $snapshots,
            $links,
            new TwitchClient($http, $state, $clock, $config->twitchClientId(), $config->twitchClientSecret()),
            new TrackerClient($http, $config->ttUserAgent()),
            $gate,
            $payload,
            $clock,
        );

        return new Router($config, $visits, $channels, $payload, new Logger($config->logPath(), $clock));
    }
}
