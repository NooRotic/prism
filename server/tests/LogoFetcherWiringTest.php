<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Container;
use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\DbTestCase;
use Prism\History\Tests\Support\FakeResolver;
use Prism\History\Tests\Support\FakeSleeper;
use Prism\History\Tests\Support\FakeTransport;
use Prism\History\Tests\Support\World;

/** How the container builds the logo copier: what it says about itself to the hosts it fetches from. */
final class LogoFetcherWiringTest extends DbTestCase
{
    private function stream(): void
    {
        $url = 'https://stream.test/live.m3u8';
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'A', 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'new', 'source' => 't', 'logo_url' => 'https://logos.test/a.png',
        ]);
    }

    /** @param array<string,mixed> $override */
    private function userAgentSent(array $override = []): string
    {
        $this->stream();
        $transport = new FakeTransport();
        $transport->push(FakeTransport::ok('not a picture'));
        Container::logoFetcher(
            World::config($override + ['playlist' => ['data_dir' => sys_get_temp_dir() . '/prism-wiring-' . bin2hex(random_bytes(4))]]),
            $this->pdo,
            new FakeResolver(['logos.test' => ['93.184.216.34']]),
            $transport,
            new FakeSleeper($this->clock),
            $this->clock,
        )->run(10);
        $this->assertCount(1, $transport->calls);

        return $transport->calls[0]['userAgent'];
    }

    public function testTheLogoCopierDoesNotHandTheTwitchTrackerContactToEveryLogoHost(): void
    {
        $sent = $this->userAgentSent();

        $this->assertSame('PRISM/1.0 (+https://prism.nooroticx.tv)', $sent);
        $this->assertStringNotContainsString('test@prism-tests.invalid', $sent, 'the contact address in tt.user_agent belongs to TwitchTracker only');
        $this->assertNotSame(World::config()->ttUserAgent(), $sent);
    }

    public function testTheOwnerCanChooseWhatTheLogoCopierSays(): void
    {
        $sent = $this->userAgentSent(['playlist' => ['user_agent' => 'PRISM-logos/2 (+https://prism.nooroticx.tv)']]);

        $this->assertSame('PRISM-logos/2 (+https://prism.nooroticx.tv)', $sent);
    }
}
