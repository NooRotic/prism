<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * The one place the server remembers a person: Twitch users who tried the admin sign-in and were refused (the
 * owner asked for this). One row per Twitch user, never per attempt; no IP, no browser details. Rows whose last
 * attempt is over 90 days old are deleted, and the table never holds more than 1,000 rows.
 */
final class AttemptStore
{
    private const DAY_MS = 86_400_000;
    private const KEEP_DAYS = 90;
    private const MAX_ROWS = 1000;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /**
     * Records a refused attempt. `$viaScript` is true when the token was not one PRISM's admin sign-in issues (it
     * carried permissions or came from another Twitch app), so a script sent it. The login is kept only if it looks
     * like a Twitch login, so a stored name can never carry markup.
     */
    public function record(string $twitchId, string $login, bool $viaScript): void
    {
        $now = Time::datetime($this->clock->nowMs());
        $this->pdo
            ->prepare(
                'INSERT INTO admin_attempts (twitch_id, login, first_attempt_at, last_attempt_at, attempts, via_script)
                 VALUES (?, ?, ?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE
                    login = VALUES(login),
                    last_attempt_at = VALUES(last_attempt_at),
                    attempts = attempts + 1,
                    via_script = GREATEST(via_script, VALUES(via_script))',
            )
            ->execute([
                $twitchId,
                preg_match('/^[A-Za-z0-9_]{1,25}$/', $login) === 1 ? $login : '',
                $now,
                $now,
                $viaScript ? 1 : 0,
            ]);

        $this->trim();
    }

    /** @return list<array{twitch_id:string,login:string,first_attempt_at:string,last_attempt_at:string,attempts:int,via_script:bool}> newest first */
    public function recent(): array
    {
        $rows = $this->pdo
            ->query('SELECT twitch_id, login, first_attempt_at, last_attempt_at, attempts, via_script FROM admin_attempts ORDER BY last_attempt_at DESC, twitch_id DESC')
            ->fetchAll();

        return array_map(static fn (array $r): array => [
            'twitch_id' => (string) $r['twitch_id'],
            'login' => (string) $r['login'],
            'first_attempt_at' => (string) $r['first_attempt_at'],
            'last_attempt_at' => (string) $r['last_attempt_at'],
            'attempts' => (int) $r['attempts'],
            'via_script' => (int) $r['via_script'] === 1,
        ], $rows);
    }

    /** How many people's last attempt was at or after this UTC time. */
    public function countSince(string $utcDatetime): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM admin_attempts WHERE last_attempt_at >= ?');
        $stmt->execute([$utcDatetime]);

        return (int) $stmt->fetchColumn();
    }

    private function trim(): void
    {
        $this->pdo
            ->prepare('DELETE FROM admin_attempts WHERE last_attempt_at < ?')
            ->execute([Time::datetime($this->clock->nowMs() - self::KEEP_DAYS * self::DAY_MS)]);

        $excess = (int) $this->pdo->query('SELECT COUNT(*) FROM admin_attempts')->fetchColumn() - self::MAX_ROWS;
        if ($excess > 0) {
            $this->pdo->exec('DELETE FROM admin_attempts ORDER BY last_attempt_at ASC, twitch_id ASC LIMIT ' . $excess);
        }
    }
}
