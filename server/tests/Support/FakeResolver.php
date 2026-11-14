<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use Prism\History\Net\Resolver;
use Throwable;

/** Answers a name lookup from a table, and remembers which names were asked. An unknown name has no address. */
final class FakeResolver implements Resolver
{
    /** @var list<string> */
    public array $calls = [];

    /** @param array<string,list<string>|Throwable> $answers lower-case host => addresses (or an exception to throw) */
    public function __construct(private array $answers = [])
    {
    }

    public function ips(string $host): array
    {
        $this->calls[] = $host;
        $answer = $this->answers[$host] ?? [];
        if ($answer instanceof Throwable) {
            throw $answer;
        }

        return $answer;
    }
}
