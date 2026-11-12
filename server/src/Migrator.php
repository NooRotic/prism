<?php

declare(strict_types=1);

namespace Prism\History;

use PDO;

/**
 * Applies the numbered `NNN_name.sql` files in a folder, each once, in filename order.
 *
 * A file is a list of plain statements separated by `;` at the end of a line (no `;` inside a string, no
 * procedures), with `--` comment lines allowed. Each statement runs on its own so an error in a later one is
 * never swallowed. The version is recorded only after the whole file succeeds. DDL cannot be rolled back, so
 * after a failure fix the file and drop any table it half-created before running again.
 */
final class Migrator
{
    public function __construct(private PDO $pdo, private string $dir)
    {
    }

    /** @return list<string> the versions applied by this run */
    public function run(): array
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(64) NOT NULL,
                applied_at DATETIME NOT NULL,
                PRIMARY KEY (version)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        );
        $done = $this->pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

        $files = glob(rtrim($this->dir, '/\\') . '/*.sql') ?: [];
        sort($files);

        $applied = [];
        foreach ($files as $file) {
            $version = basename($file, '.sql');
            if (in_array($version, $done, true)) {
                continue;
            }
            foreach (self::statements((string) file_get_contents($file)) as $statement) {
                $this->pdo->exec($statement);
            }
            $this->pdo
                ->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP())')
                ->execute([$version]);
            $applied[] = $version;
        }

        return $applied;
    }

    /** @return list<string> */
    private static function statements(string $sql): array
    {
        $lines = array_filter(
            preg_split('/\R/', $sql) ?: [],
            static fn (string $line): bool => !str_starts_with(ltrim($line), '--'),
        );
        $parts = preg_split('/;\s*(?:\R|$)/', implode("\n", $lines)) ?: [];

        return array_values(array_filter(
            array_map('trim', $parts),
            static fn (string $statement): bool => $statement !== '',
        ));
    }
}
