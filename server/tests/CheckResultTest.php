<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Prism\History\Checker\CheckResult;

final class CheckResultTest extends TestCase
{
    public function testThereAreFifteenCodesAndThreeOfThemCarryNoInformation(): void
    {
        $this->assertCount(15, CheckResult::CODES);
        $this->assertSame(['host_guard', 'voided', 'skipped'], CheckResult::NO_INFORMATION);
        $this->assertSame([], array_diff(CheckResult::NO_INFORMATION, CheckResult::CODES));
    }

    public function testAnUnknownCodeIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new CheckResult('exploded');
    }

    public function testItCarriesBytesAndFacts(): void
    {
        $r = new CheckResult('pass', 1234, ['live' => true]);

        $this->assertSame('pass', $r->code);
        $this->assertSame(1234, $r->bytes);
        $this->assertSame(['live' => true], $r->facts);
        $this->assertSame(0, (new CheckResult('pass'))->bytes);
        $this->assertSame([], (new CheckResult('pass'))->facts);
    }

    /** @return array<string,array{0:string,1:bool,2:bool,3:bool,4:bool}> code => pass, no information, no cors, failure */
    public static function kinds(): array
    {
        $rows = [];
        foreach (CheckResult::CODES as $code) {
            $rows[$code] = [
                $code,
                $code === 'pass',
                in_array($code, ['host_guard', 'voided', 'skipped'], true),
                $code === 'no_cors',
                !in_array($code, ['pass', 'host_guard', 'voided', 'skipped', 'no_cors'], true),
            ];
        }

        return $rows;
    }

    #[DataProvider('kinds')]
    public function testEachCodeIsExactlyOneKind(string $code, bool $pass, bool $noInformation, bool $noCors, bool $failure): void
    {
        $r = new CheckResult($code);

        $this->assertSame($pass, $r->isPass());
        $this->assertSame($noInformation, $r->isNoInformation());
        $this->assertSame($noCors, $r->isNoCors());
        $this->assertSame($failure, $r->isFailure());
    }
}
