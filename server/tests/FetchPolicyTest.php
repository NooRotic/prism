<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Net\FetchPolicy;

final class FetchPolicyTest extends TestCase
{
    /** @return array<string,array{0:string,1:int}> */
    public static function logoAllowed(): array
    {
        return ['http 80' => ['http', 80], 'https 443' => ['https', 443], 'https 80' => ['https', 80], 'http 443' => ['http', 443]];
    }

    #[DataProvider('logoAllowed')]
    public function testTheLogoPolicyAllowsHttpAndHttpsOnPorts80And443(string $scheme, int $port): void
    {
        $this->assertTrue(FetchPolicy::logos()->allows($scheme, $port));
    }

    /** @return array<string,array{0:string,1:int}> */
    public static function logoRefused(): array
    {
        return ['https 8443' => ['https', 8443], 'http 8080' => ['http', 8080], 'https 1024' => ['https', 1024], 'ftp 80' => ['ftp', 80], 'file' => ['file', 80]];
    }

    #[DataProvider('logoRefused')]
    public function testTheLogoPolicyRefusesEverythingElse(string $scheme, int $port): void
    {
        $this->assertFalse(FetchPolicy::logos()->allows($scheme, $port));
    }

    /** @return array<string,array{0:string,1:int}> */
    public static function checkerAllowed(): array
    {
        return [
            'https 443' => ['https', 443],
            'https 80' => ['https', 80],
            'https 1024' => ['https', 1024],
            'https 1936' => ['https', 1936],
            'https 8443' => ['https', 8443],
            'https 19360' => ['https', 19360],
            'https 65535' => ['https', 65535],
            'upper case scheme' => ['HTTPS', 443],
        ];
    }

    #[DataProvider('checkerAllowed')]
    public function testTheCheckerPolicyAllowsHttpsOn80And443AndFrom1024Up(string $scheme, int $port): void
    {
        $this->assertTrue(FetchPolicy::checker()->allows($scheme, $port));
    }

    /** @return array<string,array{0:string,1:int}> */
    public static function checkerRefused(): array
    {
        return [
            'http 80' => ['http', 80],
            'http 8080' => ['http', 8080],
            'https 1023' => ['https', 1023],
            'https 22' => ['https', 22],
            'https 8' => ['https', 8],
            'https 1719' => ['https', 1719],
            'https 2049' => ['https', 2049],
            'https 4190' => ['https', 4190],
            'https 5060' => ['https', 5060],
            'https 6000' => ['https', 6000],
            'https 6665' => ['https', 6665],
            'https 6669' => ['https', 6669],
            'https 6697' => ['https', 6697],
            'https 10080' => ['https', 10080],
            'https 65536' => ['https', 65536],
            'https 0' => ['https', 0],
            'ftp 443' => ['ftp', 443],
        ];
    }

    #[DataProvider('checkerRefused')]
    public function testTheCheckerPolicyRefusesHttpLowPortsAndTheBrowserRestrictedPorts(string $scheme, int $port): void
    {
        $this->assertFalse(FetchPolicy::checker()->allows($scheme, $port));
    }
}
