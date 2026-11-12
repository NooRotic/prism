<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

use RuntimeException;

/** PHP's built-in web server for a test: start it on a free port, call it, stop it. */
final class BuiltInServer
{
    /** @var resource */
    private $process;

    private function __construct(private int $port, $process)
    {
        $this->process = $process;
    }

    /** @param array<string,string> $env extra environment for the server */
    public static function start(string $docroot, ?string $router = null, array $env = []): self
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);
        $port = (int) substr($name, strrpos($name, ':') + 1);

        $command = [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $docroot];
        if ($router !== null) {
            $command[] = $router;
        }
        $process = proc_open(
            $command,
            [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
            null,
            array_merge(getenv(), $env),
        );

        for ($i = 0; $i < 50; $i++) {
            $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
            if ($conn !== false) {
                fclose($conn);

                return new self($port, $process);
            }
            usleep(100_000);
        }
        throw new RuntimeException('The test web server did not start');
    }

    public function url(string $path = ''): string
    {
        return 'http://127.0.0.1:' . $this->port . $path;
    }

    public function stop(): void
    {
        if (is_resource($this->process)) {
            proc_terminate($this->process);
            proc_close($this->process);
        }
    }
}
