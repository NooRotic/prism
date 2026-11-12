<?php

declare(strict_types=1);

namespace Prism\History\Tests\Support;

/** Writes a throwaway config.php pointing at the test database, and cleans it (and its log) up afterwards. */
final class ConfigFile
{
    /** @var list<string> */
    private array $files = [];

    /** @param array<string,mixed> $override */
    public function write(array $override = []): string
    {
        $path = sys_get_temp_dir() . '/prism-config-' . bin2hex(random_bytes(4)) . '.php';
        $log = sys_get_temp_dir() . '/prism-config-' . bin2hex(random_bytes(4)) . '.log';
        $config = array_replace_recursive([
            'db' => Database::config(),
            'twitch' => ['client_id' => 'cid', 'client_secret' => World::SECRET],
            'allowed_origins' => ['https://prism.nooroticx.tv'],
            'tt' => ['user_agent' => World::UA],
            'log_path' => $log,
        ], $override);
        file_put_contents($path, '<?php return ' . var_export($config, true) . ';');
        $this->files[] = $path;
        $this->files[] = $log;

        return $path;
    }

    public function cleanUp(): void
    {
        foreach ($this->files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        $this->files = [];
    }
}
