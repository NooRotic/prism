<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Prism\History\Config;

final class ConfigTest extends TestCase
{
    /** @return array<string,mixed> */
    private function base(): array
    {
        return [
            'db' => ['host' => 'dbhost', 'name' => 'dbname', 'user' => 'dbuser', 'pass' => 'dbpass'],
            'twitch' => ['client_id' => 'cid', 'client_secret' => 'S3CRET'],
            'allowed_origins' => ['https://prism.nooroticx.tv', 'http://localhost:5000'],
            'tt' => ['user_agent' => 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@prism-tests.invalid)'],
            'log_path' => '/tmp/prism-history-test.log',
        ];
    }

    public function testAPlaceholderContactInTheUserAgentIsRefused(): void
    {
        foreach (['PRISM/1.0 (contact: you@example.com)', 'PRISM/1.0 (+https://EXAMPLE.COM)'] as $agent) {
            $a = $this->base();
            $a['tt']['user_agent'] = $agent;

            try {
                Config::fromArray($a);
                $this->fail('A placeholder contact must be refused');
            } catch (InvalidArgumentException $e) {
                $this->assertStringContainsString('tt.user_agent', $e->getMessage());
            }
        }
    }

    public function testLookupsPerHourDefaultsToOneHundredMayBeZeroButNotNegative(): void
    {
        $this->assertSame(100, Config::fromArray($this->base())->lookupsPerHour());

        $zero = $this->base();
        $zero['tracking']['lookups_per_hour'] = 0;
        $this->assertSame(0, Config::fromArray($zero)->lookupsPerHour());

        $negative = $this->base();
        $negative['tracking']['lookups_per_hour'] = -1;
        $this->expectException(InvalidArgumentException::class);
        Config::fromArray($negative);
    }

    public function testAdminIsOffUntilBothIdsAreSet(): void
    {
        $this->assertFalse(Config::fromArray($this->base())->adminActive());

        $ownerOnly = $this->base();
        $ownerOnly['admin'] = ['owner_twitch_id' => '1000'];
        $this->assertFalse(Config::fromArray($ownerOnly)->adminActive());

        $clientOnly = $this->base();
        $clientOnly['admin'] = ['frontend_client_id' => 'front'];
        $this->assertFalse(Config::fromArray($clientOnly)->adminActive());

        $both = $this->base();
        $both['admin'] = ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front'];
        $c = Config::fromArray($both);
        $this->assertTrue($c->adminActive());
        $this->assertTrue($c->adminEnabled());
        $this->assertSame('1000', $c->adminOwnerTwitchId());
        $this->assertSame('front', $c->adminFrontendClientId());

        $both['admin']['enabled'] = false;
        $off = Config::fromArray($both);
        $this->assertFalse($off->adminEnabled());
        $this->assertFalse($off->adminActive());
    }

    public function testPlaylistDirsDefaultAndNeverThrow(): void
    {
        $defaults = Config::fromArray($this->base());
        $this->assertStringEndsWith('/data', str_replace('\\', '/', $defaults->playlistDataDir()));
        $this->assertStringEndsWith('/public/logos', str_replace('\\', '/', $defaults->playlistLogoDir()));

        $set = $this->base();
        $set['playlist'] = ['data_dir' => '/srv/prism/data', 'logo_dir' => '/srv/prism/logos'];
        $configured = Config::fromArray($set);
        $this->assertSame('/srv/prism/data', $configured->playlistDataDir());
        $this->assertSame('/srv/prism/logos', $configured->playlistLogoDir());

        foreach ([[], '', 7, null] as $bad) {
            $a = $this->base();
            $a['playlist'] = ['data_dir' => $bad, 'logo_dir' => $bad];
            $c = Config::fromArray($a);
            $this->assertSame($defaults->playlistDataDir(), $c->playlistDataDir(), json_encode($bad));
            $this->assertSame($defaults->playlistLogoDir(), $c->playlistLogoDir(), json_encode($bad));
        }
        $notAnArray = $this->base();
        $notAnArray['playlist'] = 'on';
        $this->assertSame($defaults->playlistDataDir(), Config::fromArray($notAnArray)->playlistDataDir());
    }

    public function testPlaylistUserAgentIsPlainAndNeverTheTwitchTrackerContact(): void
    {
        $default = Config::fromArray($this->base())->playlistUserAgent();
        $this->assertSame('PRISM/1.0 (+https://prism.nooroticx.tv)', $default);
        $this->assertStringNotContainsString('contact', $default);
        $this->assertStringNotContainsString('@', $default);

        $set = $this->base();
        $set['playlist'] = ['user_agent' => 'PRISM-logos/2 (+https://prism.nooroticx.tv/about; contact: someone@elsewhere.test)'];
        $this->assertSame('PRISM-logos/2 (+https://prism.nooroticx.tv/about; contact: someone@elsewhere.test)', Config::fromArray($set)->playlistUserAgent(), 'an owner who chooses to put a contact in it can');

        foreach ([[], '', 7, null, str_repeat('a', 201), "bad\r\nHeader: x", "tab\tin it"] as $bad) {
            $a = $this->base();
            $a['playlist'] = ['user_agent' => $bad];
            $this->assertSame($default, Config::fromArray($a)->playlistUserAgent(), json_encode($bad));
        }
    }

    public function testAnIntegerOwnerIdIsReadAsText(): void
    {
        $a = $this->base();
        $a['admin'] = ['owner_twitch_id' => 1000, 'frontend_client_id' => 'front'];

        $this->assertSame('1000', Config::fromArray($a)->adminOwnerTwitchId());
    }

    public function testMalformedAdminKeysTurnAdminOffAndDoNotThrow(): void
    {
        $cases = [
            ['owner_twitch_id' => [], 'frontend_client_id' => 'front'],
            ['owner_twitch_id' => 'abc', 'frontend_client_id' => 'front'],
            ['owner_twitch_id' => '', 'frontend_client_id' => 'front'],
            ['owner_twitch_id' => str_repeat('1', 21), 'frontend_client_id' => 'front'],
            ['owner_twitch_id' => '1000', 'frontend_client_id' => []],
            ['owner_twitch_id' => '1000', 'frontend_client_id' => ''],
            ['owner_twitch_id' => '1000', 'frontend_client_id' => 'front', 'enabled' => 'yes'],
        ];
        foreach ($cases as $admin) {
            $a = $this->base();
            $a['admin'] = $admin;

            $c = Config::fromArray($a);

            $this->assertFalse($c->adminActive(), json_encode($admin));
            $this->assertSame(1500, $c->ttDayBudget());
        }
        $notAnArray = $this->base();
        $notAnArray['admin'] = 'on';
        $this->assertFalse(Config::fromArray($notAnArray)->adminActive());
    }

    public function testFromArrayAppliesDefaults(): void
    {
        $c = Config::fromArray($this->base());

        $this->assertSame(1500, $c->ttGapMs());
        $this->assertSame(300, $c->ttRunBudget());
        $this->assertSame(1500, $c->ttDayBudget());
        $this->assertSame(30, $c->tailDays());
        $this->assertSame(20, $c->newPerHour());
        $this->assertSame(200, $c->newPerDay());
        $this->assertSame(7, $c->untrackedRecheckDays());
        $this->assertTrue($c->ttEnabled());
        $this->assertTrue($c->visitsEnabled());
        $this->assertTrue($c->newChannelsEnabled());
    }

    public function testGettersReturnTheConfiguredValues(): void
    {
        $a = $this->base();
        $a['tt'] = ['enabled' => false, 'user_agent' => 'UA', 'gap_ms' => 2000, 'run_budget' => 10, 'day_budget' => 20];
        $a['tracking'] = ['tail_days' => 14, 'new_per_hour' => 3, 'new_per_day' => 9, 'untracked_recheck_days' => 2];
        $a['flags'] = ['visits_enabled' => false, 'new_channels_enabled' => false];
        $c = Config::fromArray($a);

        $this->assertSame(['host' => 'dbhost', 'name' => 'dbname', 'user' => 'dbuser', 'pass' => 'dbpass'], $c->db());
        $this->assertSame('cid', $c->twitchClientId());
        $this->assertSame('S3CRET', $c->twitchClientSecret());
        $this->assertSame(['https://prism.nooroticx.tv', 'http://localhost:5000'], $c->allowedOrigins());
        $this->assertFalse($c->ttEnabled());
        $this->assertSame('UA', $c->ttUserAgent());
        $this->assertSame(2000, $c->ttGapMs());
        $this->assertSame(10, $c->ttRunBudget());
        $this->assertSame(20, $c->ttDayBudget());
        $this->assertSame(14, $c->tailDays());
        $this->assertSame(3, $c->newPerHour());
        $this->assertSame(9, $c->newPerDay());
        $this->assertSame(2, $c->untrackedRecheckDays());
        $this->assertFalse($c->visitsEnabled());
        $this->assertFalse($c->newChannelsEnabled());
        $this->assertSame('/tmp/prism-history-test.log', $c->logPath());
    }

    public function testMissingRequiredKeyNamesTheKeyButNotASecret(): void
    {
        $a = $this->base();
        unset($a['db']['name']);

        try {
            Config::fromArray($a);
            $this->fail('A missing db.name must be rejected');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('db.name', $e->getMessage());
            $this->assertStringNotContainsString('S3CRET', $e->getMessage());
            $this->assertStringNotContainsString('dbpass', $e->getMessage());
        }
    }

    public function testAWrongTypeNamesTheKeyButNotTheValue(): void
    {
        $a = $this->base();
        $a['tt']['gap_ms'] = 'S3CRET-not-an-int';

        try {
            Config::fromArray($a);
            $this->fail('A non-integer tt.gap_ms must be rejected');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('tt.gap_ms', $e->getMessage());
            $this->assertStringNotContainsString('S3CRET', $e->getMessage());
        }
    }

    public function testLoadReadsAReturnedArray(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'prism-cfg');
        file_put_contents($file, '<?php return ' . var_export($this->base(), true) . ';');

        try {
            $this->assertSame('cid', Config::load($file)->twitchClientId());
        } finally {
            unlink($file);
        }
    }

    public function testLoadRejectsFileThatDoesNotReturnAnArray(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'prism-cfg');
        file_put_contents($file, "<?php return 'nope';");

        try {
            $this->expectException(InvalidArgumentException::class);
            Config::load($file);
        } finally {
            unlink($file);
        }
    }

    public function testAllowedOriginsMustBeAList(): void
    {
        $asMap = $this->base();
        $asMap['allowed_origins'] = ['site' => 'https://prism.nooroticx.tv'];
        $asString = $this->base();
        $asString['allowed_origins'] = 'https://prism.nooroticx.tv';

        foreach ([$asMap, $asString] as $bad) {
            try {
                Config::fromArray($bad);
                $this->fail('allowed_origins must be a list of strings');
            } catch (InvalidArgumentException $e) {
                $this->assertStringContainsString('allowed_origins', $e->getMessage());
            }
        }
    }
}
