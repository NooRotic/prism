<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use Prism\History\Playlist\StreamUrl;
use Prism\History\Store\StreamStore;
use Prism\History\Tests\Support\Database;
use Prism\History\Tests\Support\DbTestCase;

/** Runs bin/rejudge-held.php as an operator would. */
final class RejudgeCliTest extends DbTestCase
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
        $path = sys_get_temp_dir() . '/prism-rejudge-config-' . bin2hex(random_bytes(3)) . '.php';
        $log = sys_get_temp_dir() . '/prism-rejudge-' . bin2hex(random_bytes(3)) . '.log';
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

    /** @param list<string> $args @return array{0:int,1:string,2:string} exit code, stdout, stderr */
    private function cli(array $args, ?string $configPath = null): array
    {
        $process = proc_open(
            [PHP_BINARY, __DIR__ . '/../bin/rejudge-held.php', ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(getenv(), ['PRISM_HISTORY_CONFIG' => $configPath ?? $this->configFile()]),
        );
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);

        return [proc_close($process), $out, $err];
    }

    private function heldRow(string $url): string
    {
        $id = StreamUrl::id($url);
        (new StreamStore($this->pdo, $this->clock))->insertIfNew([
            'id' => $id, 'public_id' => StreamUrl::publicId($id), 'url' => $url, 'name' => 'S', 'groups_json' => '["News"]',
            'kind' => 'hls', 'state' => 'held', 'state_reason' => 'port', 'source' => 'test',
        ]);

        return StreamUrl::publicId($id);
    }

    private function reason(string $publicId): ?string
    {
        $stmt = $this->pdo->prepare('SELECT state_reason FROM streams WHERE public_id = ?');
        $stmt->execute([$publicId]);
        $value = $stmt->fetchColumn();

        return $value === false || $value === null ? null : (string) $value;
    }

    public function testWithoutApplyItOnlyReportsAndChangesNothing(): void
    {
        $id = $this->heldRow('https://a.test:8443/x.m3u8');

        [$code, $out] = $this->cli([]);

        $this->assertSame(0, $code);
        $this->assertSame("candidates=1 moved=0\n", $out);
        $this->assertSame('port', $this->reason($id));
    }

    public function testApplyMovesTheRows(): void
    {
        $id = $this->heldRow('https://a.test:8443/x.m3u8');

        [$code, $out] = $this->cli(['--apply']);

        $this->assertSame(0, $code);
        $this->assertSame("candidates=1 moved=1\n", $out);
        $this->assertSame('awaiting_check', $this->reason($id));
    }

    public function testABadArgumentExitsWithUsage(): void
    {
        [$code, , $err] = $this->cli(['--nonsense']);

        $this->assertSame(2, $code);
        $this->assertStringContainsString('usage:', $err);
    }

    public function testABrokenConfigExitsNonZeroAndPrintsNoPathOrSecret(): void
    {
        [$code, $out, $err] = $this->cli([], '/definitely/not/here/config.php');

        $this->assertSame(1, $code);
        $this->assertStringNotContainsString('not/here', $out . $err);
        $this->assertStringContainsString('rejudge failed', $err);
    }
}
