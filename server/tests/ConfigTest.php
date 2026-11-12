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
            'tt' => ['user_agent' => 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: test@example.com)'],
            'log_path' => '/tmp/prism-history-test.log',
        ];
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
