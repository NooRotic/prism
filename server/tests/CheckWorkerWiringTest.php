<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Checker\CheckWorker;
use Prism\History\Config;
use Prism\History\Container;
use Prism\History\Net\Resolver;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\FakeTransport;

/** The container builds a worker whose requests carry the configured user agent and origin, and go through the checker's policy. */
final class CheckWorkerWiringTest extends DbTestCase
{
    private function config(): Config
    {
        return Config::fromArray([
            'db' => ['host' => 'h', 'name' => 'n', 'user' => 'u', 'pass' => 'p'],
            'twitch' => ['client_id' => 'cid', 'client_secret' => 'S3CRET'],
            'allowed_origins' => ['https://prism.nooroticx.tv'],
            'tt' => ['user_agent' => 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@prism-tests.invalid)'],
            'log_path' => '/tmp/prism-wiring.log',
            'playlist' => ['check_origin' => 'https://staging.example.test', 'check_user_agent' => 'Wiring-Test/9 (+https://example.test/c/)', 'data_dir' => sys_get_temp_dir() . '/prism-wiring-data', 'logo_dir' => sys_get_temp_dir() . '/prism-wiring-logos'],
        ]);
    }

    public function testTheContainerBuildsAWorkerThatUsesTheConfiguredIdentityAndThePolicy(): void
    {
        $resolver = new class implements Resolver {
            public function ips(string $host): array
            {
                return ['93.184.216.34'];
            }
        };
        $transport = new FakeTransport();
        $transport->push(
            FakeTransport::ok("#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n", ['access-control-allow-origin' => '*']),
            FakeTransport::ok(str_repeat('B', 100), ['access-control-allow-origin' => '*']),
        );
        $url = 'https://wired.test:8443/live.m3u8';
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'W', 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 'test',
        ]);

        $worker = Container::checkWorker($this->config(), $this->pdo, $resolver, $transport, new FakeSleeper($this->clock), $this->clock);
        $result = $worker->run(0, 1, 10, false);

        $this->assertInstanceOf(CheckWorker::class, $worker);
        $this->assertSame(1, $result['passed'], 'a stream on https port 8443 is within the checker policy');
        $this->assertSame('Wiring-Test/9 (+https://example.test/c/)', $transport->calls[0]['userAgent']);
        $this->assertSame('https://staging.example.test', $transport->calls[0]['headers']['Origin']);
    }
}
