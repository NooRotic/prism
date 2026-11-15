<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Checker\HostGuard;

final class HostGuardTest extends TestCase
{
    /** @return list<array{host:string,failed:bool}> */
    private static function results(string $host, int $checked, int $failed): array
    {
        $rows = [];
        for ($i = 0; $i < $checked; $i++) {
            $rows[] = ['host' => $host, 'failed' => $i < $failed];
        }

        return $rows;
    }

    public function testAHostWithFourCheckedAndMoreThanHalfFailedIsGuarded(): void
    {
        $this->assertSame(['a.test' => true], HostGuard::guardedHosts(self::results('a.test', 4, 3)));
        $this->assertSame(['a.test' => true], HostGuard::guardedHosts(self::results('a.test', 4, 4)));
    }

    public function testExactlyHalfIsNotMoreThanHalf(): void
    {
        $this->assertSame([], HostGuard::guardedHosts(self::results('a.test', 4, 2)));
        $this->assertSame([], HostGuard::guardedHosts(self::results('a.test', 8, 4)));
    }

    public function testAHostWithFewerThanFourCheckedIsNeverGuarded(): void
    {
        $this->assertSame([], HostGuard::guardedHosts(self::results('a.test', 3, 3)));
        $this->assertSame([], HostGuard::guardedHosts(self::results('a.test', 1, 1)));
    }

    public function testALargerHostIsGuardedOnTheSameRule(): void
    {
        $this->assertSame(['d.test' => true], HostGuard::guardedHosts(self::results('d.test', 8, 5)));
        $this->assertSame([], HostGuard::guardedHosts(self::results('d.test', 92, 46)));
        $this->assertSame(['d.test' => true], HostGuard::guardedHosts(self::results('d.test', 92, 47)));
    }

    public function testHostsAreJudgedIndependently(): void
    {
        $results = [
            ...self::results('bad.test', 5, 5),
            ...self::results('good.test', 5, 0),
            ...self::results('half.test', 6, 3),
            ...self::results('small.test', 2, 2),
        ];

        $this->assertSame(['bad.test' => true], HostGuard::guardedHosts($results));
    }

    public function testNoResultsGuardNothing(): void
    {
        $this->assertSame([], HostGuard::guardedHosts([]));
    }
}
