<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;

/** Runs bin/refresh.php as cron would, against an empty database so no outside call is made. */
final class RefreshCliTest extends DbTestCase
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

    private function configFile(): string
    {
        $path = sys_get_temp_dir() . '/prism-cli-config-' . bin2hex(random_bytes(3)) . '.php';
        $log = sys_get_temp_dir() . '/prism-cli-' . bin2hex(random_bytes(3)) . '.log';
        $config = [
            'db' => Database::config(),
            'twitch' => ['client_id' => 'cid', 'client_secret' => 'SECRET-xyz-never-in-output'],
            'allowed_origins' => ['https://prism.nooroticx.tv'],
            'tt' => ['user_agent' => 'PRISM/1.0 (test)'],
            'log_path' => $log,
        ];
        file_put_contents($path, '<?php return ' . var_export($config, true) . ';');
        $this->files[] = $path;
        $this->files[] = $log;

        return $path;
    }

    /** @return array{0:int,1:string,2:string} exit code, stdout, stderr */
    private function cron(string $configPath): array
    {
        $process = proc_open(
            [PHP_BINARY, __DIR__ . '/../bin/refresh.php'],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PRISM_HISTORY_CONFIG' => $configPath]),
        );
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);

        return [proc_close($process), $out, $err];
    }

    public function testRunsAsCronWouldAndPrintsACountsLine(): void
    {
        [$code, $out] = $this->cron($this->configFile());

        $this->assertSame(0, $code);
        $this->assertMatchesRegularExpression('/^refresh dormant=0 gone=0 profiles=0 tt_ok=0 tt_untracked=0 tt_error=0 tt_skipped=0 stopped_by=done$/m', $out);
    }

    public function testABrokenConfigExitsNonZeroAndPrintsNoPathOrSecret(): void
    {
        [$code, $out, $err] = $this->cron('/definitely/not/here/config.php');

        $this->assertSame(1, $code);
        $this->assertStringNotContainsString('not/here', $out . $err);
        $this->assertStringContainsString('refresh failed', $err);
    }
}
