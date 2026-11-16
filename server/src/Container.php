<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;
use Prism\History\Admin\AdminController;
use Prism\History\Admin\AdminGuard;
use Prism\History\Admin\AdminReports;
use Prism\History\Admin\ChannelAdmin;
use Prism\History\Admin\CheckerAdmin;
use Prism\History\Admin\PlaylistAdmin;
use Prism\History\Admin\TokenCache;
use Prism\History\Api\Router;
use Prism\History\Api\StreamsController;
use Prism\History\Checker\CheckerState;
use Prism\History\Checker\CheckWorker;
use Prism\History\Checker\HostPacer;
use Prism\History\Checker\StreamChecker;
use Prism\History\Http\CurlHttp;
use Prism\History\Http\HttpClient;
use Prism\History\Net\CurlPinnedTransport;
use Prism\History\Net\FetchPolicy;
use Prism\History\Net\PinnedTransport;
use Prism\History\Net\Resolver;
use Prism\History\Net\SafeFetcher;
use Prism\History\Net\SystemResolver;
use Prism\History\Playlist\HeldRejudge;
use Prism\History\Playlist\Importer;
use Prism\History\Playlist\LogoFetcher;
use Prism\History\Playlist\SnapshotWriter;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\AuditStore;
use Prism\History\Store\BioLinkStore;
use Prism\History\Store\ChannelStore;
use Prism\History\Store\FavoriteStore;
use Prism\History\Store\JobState;
use Prism\History\Store\SnapshotStore;
use Prism\History\Store\StreamStore;
use Prism\History\Store\UsageCounters;
use Prism\History\Tracker\Sleeper;
use Prism\History\Tracker\SystemSleeper;
use Prism\History\Tracker\TrackerClient;
use Prism\History\Tracker\TtGate;
use Prism\History\Twitch\TokenValidator;
use Prism\History\Twitch\TwitchClient;
use Prism\History\Usage\FavoriteRecorder;
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
        $streams = new StreamStore($pdo, $s['clock']);
        $playlistAdmin = new PlaylistAdmin(
            $pdo,
            $streams,
            $audit,
            new SnapshotWriter($streams, $s['clock'], $config->playlistDataDir()),
            $s['clock'],
            $config->playlistLogoDir(),
        );
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

        $checkerAdmin = new CheckerAdmin(
            $pdo,
            $streams,
            $audit,
            new CheckerState($s['state'], $s['clock']),
            new SnapshotWriter($streams, $s['clock'], $config->playlistDataDir()),
            $s['clock'],
            $config->checkerDailyCapBytes(),
            $config->checkerFirstPassCapBytes(),
        );

        $favoriteStore = new FavoriteStore($pdo, $s['clock']);

        return new Router(
            $config,
            $visits,
            $s['channels'],
            $s['payload'],
            $s['logger'],
            $hits,
            new AdminController($guard, $reports, new ChannelAdmin($pdo, $s['channels'], $audit), $playlistAdmin, $checkerAdmin),
            new StreamsController($config->playlistDataDir()),
            new FavoriteRecorder($favoriteStore, $streams, $cap),
            $favoriteStore,
        );
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

    public static function importer(Config $config, PDO $pdo, ?Clock $clock = null): Importer
    {
        $clock ??= new SystemClock();

        return new Importer(new StreamStore($pdo, $clock), $clock);
    }

    /** The re-judge of streams held for their port (bin/rejudge-held.php). */
    public static function heldRejudge(Config $config, PDO $pdo, ?Clock $clock = null): HeldRejudge
    {
        $clock ??= new SystemClock();

        return new HeldRejudge(new StreamStore($pdo, $clock), new AuditStore($pdo, $clock), $clock);
    }

    public static function snapshotWriter(Config $config, PDO $pdo, ?Clock $clock = null): SnapshotWriter
    {
        $clock ??= new SystemClock();

        return new SnapshotWriter(new StreamStore($pdo, $clock), $clock, $config->playlistDataDir());
    }

    /** The logo copier. Tests pass a fake resolver, transport, sleeper and clock; the real ones are used when they are null. */
    public static function logoFetcher(
        Config $config,
        PDO $pdo,
        ?Resolver $resolver = null,
        ?PinnedTransport $transport = null,
        ?Sleeper $sleeper = null,
        ?Clock $clock = null,
    ): LogoFetcher {
        $clock ??= new SystemClock();
        $store = new StreamStore($pdo, $clock);

        return new LogoFetcher(
            new SafeFetcher($resolver ?? new SystemResolver(), $transport ?? new CurlPinnedTransport(), $config->playlistUserAgent()),
            $store,
            new SnapshotWriter($store, $clock, $config->playlistDataDir()),
            $sleeper ?? new SystemSleeper(),
            $clock,
            $config->playlistLogoDir(),
        );
    }

    /** The playlist's streams table (for the commands that only read or count). */
    public static function streamStore(Config $config, PDO $pdo, ?Clock $clock = null): StreamStore
    {
        return new StreamStore($pdo, $clock ?? new SystemClock());
    }

    /** The checker's bookkeeping: applied or not, the kill switch, the byte counts. */
    public static function checkerState(Config $config, PDO $pdo, ?Clock $clock = null): CheckerState
    {
        $clock ??= new SystemClock();

        return new CheckerState(new JobState($pdo, $clock), $clock);
    }

    /**
     * One checker worker: the guarded fetcher with the checker's policy (https only, ports 80, 443 and 1024 up minus the ones
     * browsers refuse), the configured user agent and origin, and a pacer so no host sees more than a request a second.
     * Tests pass a fake resolver, transport, sleeper and clock; the real ones are used when they are null.
     */
    public static function checkWorker(
        Config $config,
        PDO $pdo,
        ?Resolver $resolver = null,
        ?PinnedTransport $transport = null,
        ?Sleeper $sleeper = null,
        ?Clock $clock = null,
    ): CheckWorker {
        $clock ??= new SystemClock();
        $store = new StreamStore($pdo, $clock);
        $pacer = new HostPacer($sleeper ?? new SystemSleeper(), $clock);
        $fetcher = new SafeFetcher($resolver ?? new SystemResolver(), $transport ?? new CurlPinnedTransport(), $config->checkerUserAgent(), 3, FetchPolicy::checker());

        return new CheckWorker(
            $store,
            new StreamChecker($fetcher, $config->checkerOrigin(), $clock, StreamChecker::DENY_HOSTS, $pacer),
            new CheckerState(new JobState($pdo, $clock), $clock),
            $clock,
            new SnapshotWriter($store, $clock, $config->playlistDataDir()),
            $config->playlistLogoDir(),
            $config->checkerDailyCapBytes(),
            $config->checkerFirstPassCapBytes(),
            $pacer,
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
