<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Logger;
use Prism\History\Tests\Support\FakeClock;
use stdClass;

final class LoggerTest extends TestCase
{
    private string $path;

    protected function setUp(): void
    {
        $this->path = sys_get_temp_dir() . '/prism-log-' . bin2hex(random_bytes(4)) . '.log';
    }

    protected function tearDown(): void
    {
        if (is_file($this->path)) {
            unlink($this->path);
        }
    }

    /** @return list<string> */
    private function lines(): array
    {
        return file($this->path, FILE_IGNORE_NEW_LINES) ?: [];
    }

    public function testWritesOneLinePerCall(): void
    {
        $log = new Logger($this->path, FakeClock::at('2026-11-12T03:00:00Z'));

        $log->info('refresh', ['tt_ok' => 3, 'stopped_by' => 'done']);
        $log->info('visit');

        $this->assertSame(
            ['[2026-11-12 03:00:00Z] refresh tt_ok=3 stopped_by=done', '[2026-11-12 03:00:00Z] visit'],
            $this->lines(),
        );
    }

    public function testDropsNonScalarValues(): void
    {
        $log = new Logger($this->path, FakeClock::at('2026-11-12T03:00:00Z'));

        $log->info('refresh', ['list' => [1, 2], 'obj' => new stdClass(), 'none' => null, 'count' => 2, 'flag' => true]);

        $this->assertSame(['[2026-11-12 03:00:00Z] refresh count=2 flag=true'], $this->lines());
    }

    public function testDropsKeysThatLookLikeSecrets(): void
    {
        $log = new Logger($this->path, FakeClock::at('2026-11-12T03:00:00Z'));

        $log->info('probe', [
            'api_key' => 'KEYVALUE',
            'Password' => 'PASSVALUE',
            'access_token' => 'TOKENVALUE',
            'client_secret' => 'SECRETVALUE',
            'auth_header' => 'AUTHVALUE',
            'ok' => 1,
        ]);

        $this->assertSame(['[2026-11-12 03:00:00Z] probe ok=1'], $this->lines());
        $this->assertStringNotContainsString('VALUE', (string) file_get_contents($this->path));
    }

    public function testNewlinesInValuesCannotForgeALogLine(): void
    {
        $log = new Logger($this->path, FakeClock::at('2026-11-12T03:00:00Z'));

        $log->info("refresh\nforged", ['note' => "a\r\n[2026-01-01 00:00:00Z] forged"]);

        $this->assertCount(1, $this->lines());
    }

    public function testALogFileThatCannotBeWrittenDoesNotThrow(): void
    {
        $log = new Logger('/nonexistent-dir-for-prism/history.log', FakeClock::at('2026-11-12T03:00:00Z'));

        $log->info('refresh', ['ok' => 1]);

        $this->addToAssertionCount(1);
    }
}
