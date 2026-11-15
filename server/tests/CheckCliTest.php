<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Playlist\StreamUrl;
use Prism\History\RunLock;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;

/**
 * Runs bin/check-streams.php and bin/check-worker.php as cron and an operator would. No stream is ever due in these tests (the
 * ones inserted are owner removals), so nothing here touches the network; the checking itself is proved by CheckWorkerTest.
 */
final class CheckCliTest extends DbTestCase
{
    /** @var list<string> */
    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }

    /** @param array<string,mixed> $extra */
    private function configFile(array $extra = []): string
    {
        $path = sys_get_temp_dir() . '/prism-check-config-' . bin2hex(random_bytes(3)) . '.php';
        $log = sys_get_temp_dir() . '/prism-check-' . bin2hex(random_bytes(3)) . '.log';
        $config = [
            'db' => Database::config(),
            'twitch' => ['client_id' => 'cid', 'client_secret' => 'SECRET-xyz-never-in-output'],
            'allowed_origins' => ['https://prism.nooroticx.tv'],
            'tt' => ['user_agent' => 'PRISM/1.0 (test)'],
            'log_path' => $log,
        ] + $extra;
        file_put_contents($path, '<?php return ' . var_export($config, true) . ';');
        $this->files[] = $path;
        $this->files[] = $log;

        return $path;
    }

    /** @param list<string> $args @return array{0:int,1:string,2:string} exit code, stdout, stderr */
    private function cli(string $script, array $args, ?string $configPath = null): array
    {
        $process = proc_open(
            [PHP_BINARY, __DIR__ . '/../bin/' . $script, ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PRISM_HISTORY_CONFIG' => $configPath ?? $this->configFile()]),
        );
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);

        return [proc_close($process), $out, $err];
    }

    /** A stream the checker must never pick up: the owner removed it. */
    private function removed(string $n): void
    {
        $url = 'https://secret-host-' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'S' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'removed', 'source' => 'test',
        ]);
    }

    private function listed(string $n): void
    {
        $url = 'https://listed-' . $n . '.test/live.m3u8';
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'L' . $n, 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'working', 'source' => 'test', 'ever_passed' => 1,
            'next_check_at' => '2099-01-01 00:00:00', // not due: nothing is fetched
        ]);
    }

    public function testStatusOnAFreshDatabaseIsShadowNotPausedAndCountsTheEligibleStreams(): void
    {
        $this->listed('1');
        $this->listed('2');
        $this->removed('1');

        [$code, $out] = $this->cli('check-streams.php', ['--status']);

        $this->assertSame(0, $code);
        $this->assertSame("mode=shadow paused=0 checked=0 eligible=2\n", $out);
    }

    public function testPauseAndResumeFlipTheKillSwitchAndAPausedRunDoesNothing(): void
    {
        $config = $this->configFile();

        [$code, $out] = $this->cli('check-streams.php', ['--pause'], $config);
        $this->assertSame([0, "paused\n"], [$code, $out]);

        [, $status] = $this->cli('check-streams.php', ['--status'], $config);
        $this->assertStringContainsString('paused=1', $status);

        [$code, $out] = $this->cli('check-streams.php', [], $config);
        $this->assertSame(0, $code);
        $this->assertSame("workers=1 checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0 stopped=paused\n", $out);

        [$code, $out] = $this->cli('check-streams.php', ['--resume'], $config);
        $this->assertSame([0, "resumed\n"], [$code, $out]);
        [, $status] = $this->cli('check-streams.php', ['--status'], $config);
        $this->assertStringContainsString('paused=0', $status);
    }

    public function testARunWithNothingDuePrintsZeros(): void
    {
        $this->listed('1');

        [$code, $out] = $this->cli('check-streams.php', []);

        $this->assertSame([0, "workers=1 checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0\n"], [$code, $out]);
    }

    public function testTwoConfiguredWorkersAreStartedAsTwoProcessesAndTheirCountsAreSummed(): void
    {
        $this->listed('1');
        $config = $this->configFile(['checker' => ['workers' => 2]]);

        [$code, $out, $err] = $this->cli('check-streams.php', ['--first-pass'], $config);

        $this->assertSame(0, $code, $err);
        $this->assertSame("workers=2 checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0\n", $out);
    }

    public function testASecondLaunchWhileOneIsRunningExitsQuietly(): void
    {
        $this->pdo->query("SELECT GET_LOCK('" . RunLock::CHECKER . "', 0)")->fetchColumn();
        try {
            [$code, $out] = $this->cli('check-streams.php', []);
        } finally {
            $this->pdo->query("SELECT RELEASE_LOCK('" . RunLock::CHECKER . "')")->fetchColumn();
        }

        $this->assertSame([0, "skipped (another run is active)\n"], [$code, $out]);
    }

    public function testABadArgumentExitsWithUsage(): void
    {
        foreach ([['--nonsense'], ['--limit=0'], ['--limit=2001'], ['--limit=abc'], ['--pause', '--resume'], ['--status', '--first-pass'], ['extra']] as $args) {
            [$code, , $err] = $this->cli('check-streams.php', $args);

            $this->assertSame(2, $code, implode(' ', $args));
            $this->assertStringContainsString('usage:', $err);
        }
    }

    public function testALimitIsAccepted(): void
    {
        [$code, $out] = $this->cli('check-streams.php', ['--limit=50', '--first-pass']);

        $this->assertSame([0, "workers=1 checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0\n"], [$code, $out]);
    }

    public function testNothingPrintedNamesAStreamOrAConfigValue(): void
    {
        $this->removed('1');
        $this->removed('2');

        [, $out, $err] = $this->cli('check-streams.php', ['--status']);
        [, $out2, $err2] = $this->cli('check-streams.php', []);

        $all = $out . $err . $out2 . $err2;
        $this->assertStringNotContainsString('secret-host', $all);
        $this->assertStringNotContainsString('SECRET-xyz', $all);
        $this->assertStringNotContainsString('.test', $all);
    }

    public function testABrokenConfigExitsNonZeroAndPrintsNoPathOrSecret(): void
    {
        [$code, $out, $err] = $this->cli('check-streams.php', [], '/definitely/not/here/config.php');

        $this->assertSame(1, $code);
        $this->assertStringNotContainsString('not/here', $out . $err);
        $this->assertStringContainsString('check failed', $err);
    }

    public function testTheWorkerScriptTakesItsSliceAndPrintsOneLine(): void
    {
        [$code, $out] = $this->cli('check-worker.php', ['1/2', '--first-pass', '--limit=10']);

        $this->assertSame([0, "checked=0 passed=0 failed=0 guarded=0 voided=0 bytes=0\n"], [$code, $out]);
    }

    public function testTheWorkerScriptRefusesABadSlice(): void
    {
        foreach ([['2/2'], ['0/0'], ['a/b'], ['1/13'], [], ['1/2', '--bogus']] as $args) {
            [$code, , $err] = $this->cli('check-worker.php', $args);

            $this->assertSame(2, $code, implode(' ', $args));
            $this->assertStringContainsString('usage:', $err);
        }
    }
}
