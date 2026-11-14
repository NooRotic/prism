<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;
use Prism\History\Admin\AdminController;
use Prism\History\Admin\AdminGuard;
use Prism\History\Admin\AdminReports;
use Prism\History\Admin\ChannelAdmin;
use Prism\History\Admin\TokenCache;
use Prism\History\Api\Router;
use Prism\History\Api\StreamsController;
use Prism\History\Http\CurlHttp;
use Prism\History\Http\HttpClient;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\AuditStore;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\JobState;
use Prism\History\Store\SnapshotStore;
use Prism\History\Store\UsageCounters;
use Prism\History\Tracker\Sleeper;
use Prism\History\Tracker\SystemSleeper;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TokenValidator;
use Prism\History\Twitch\TwitchClient;
use Prism\History\Usage\HitRecorder;

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
        $s = self::services($config, $pdo, $http, $clock, $sleeper);
        $visits = new VisitService(
            $config,
            $s['channels'],
            $s['snapshots'],
            $s['links'],
            $s['twitch'],
            $s['tracker'],
            $s['gate'],
            $s['payload'],
            $s['clock'],
            $s['state'],
            $s['counters'],
        );
        $cap = new RateCap($s['state'], $s['clock']);
        $hits = new HitRecorder($s['counters'], $cap);
        $attempts = new AttemptStore($pdo, $s['clock']);
        $guard = new AdminGuard(
            $config,
            new TokenValidator($s['http']),
            new TokenCache($pdo, $s['clock']),
            $attempts,
            $s['counters'],
            $cap,
            $s['clock'],
        );
        $audit = new AuditStore($pdo, $s['clock']);
        $reports = new AdminReports(
            $config,
            $s['counters'],
            $attempts,
            $audit,
            $s['state'],
            $s['gate'],
            $s['channels'],
            $s['clock'],
        );

        return new Router($config, $visits, $s['channels'], $s['payload'], $s['logger'], $hits, new AdminController($guard, $reports, new ChannelAdmin($pdo, $s['channels'], $audit)), new StreamsController($config->playlistDataDir()));
    }

    /** The schema migrator over the migrations/ folder that ships next to src/. */
    public static function migrator(Config $config, PDO $pdo): Migrator
    {
        return new Migrator($pdo, dirname(__DIR__) . '/migrations');
    }

    public static function refreshJob(
        Config $config,
        PDO $pdo,
        ?HttpClient $http = null,
        ?Clock $clock = null,
        ?Sleeper $sleeper = null,
    ): RefreshJob {
        $s = self::services($config, $pdo, $http, $clock, $sleeper);

        return new RefreshJob(
            $config,
            $s['channels'],
            $s['snapshots'],
            $s['links'],
            $s['twitch'],
            $s['tracker'],
            $s['gate'],
            $s['logger'],
            $s['clock'],
            new RunLock($pdo),
            $s['state'],
        );
    }

    /** @return array{http:HttpClient,clock:Clock,state:JobState,channels:ChannelStore,snapshots:SnapshotStore,links:BioLinkStore,counters:UsageCounters,twitch:TwitchClient,tracker:TrackerClient,gate:TtGate,payload:ChannelPayload,logger:Logger} */
    private static function services(Config $config, PDO $pdo, ?HttpClient $http, ?Clock $clock, ?Sleeper $sleeper): array
    {
        $clock ??= new SystemClock();
        $http ??= new CurlHttp();
        $state = new JobState($pdo, $clock);
        $channels = new ChannelStore($pdo, $clock);
        $snapshots = new SnapshotStore($pdo, $clock);
        $links = new BioLinkStore($pdo, $clock);

        return [
            'http' => $http,
            'clock' => $clock,
            'state' => $state,
            'channels' => $channels,
            'snapshots' => $snapshots,
            'links' => $links,
            'counters' => new UsageCounters($pdo, $clock),
            'twitch' => new TwitchClient($http, $state, $clock, $config->twitchClientId(), $config->twitchClientSecret()),
            'tracker' => new TrackerClient($http, $config->ttUserAgent()),
            'gate' => new TtGate(
                $pdo,
                $clock,
                $sleeper ?? new SystemSleeper(),
                $state,
                $config->ttGapMs(),
                $config->ttRunBudget(),
                $config->ttDayBudget(),
            ),
            'payload' => new ChannelPayload($channels, $snapshots, $links, $clock),
            'logger' => new Logger($config->logPath(), $clock),
        ];
    }
}
