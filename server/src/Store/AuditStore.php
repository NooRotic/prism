<?php

declare(strict_types=1);

namespace Prism\History\Store;

use PDO;
use Prism\History\Clock;
use Prism\History\Time;

/**
 * What the owner changed through the admin side, so an unfamiliar change shows up if the owner's token is ever
 * misused. Rows are kept 180 days. No IP.
 */
final class AuditStore
{
    private const DAY_MS = 86_400_000;
    private const KEEP_DAYS = 180;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Over-long text is cut to the column sizes, never refused: an audit row must not be the thing that fails. */
    public function record(string $action, string $target, string $detail): void
    {
        $now = $this->clock->nowMs();
        $this->pdo
            ->prepare('INSERT INTO admin_audit (at, action, target, detail) VALUES (?, ?, ?, ?)')
            ->execute([Time::datetime($now), mb_substr($action, 0, 40), mb_substr($target, 0, 100), mb_substr($detail, 0, 255)]);
        $this->pdo
            ->prepare('DELETE FROM admin_audit WHERE at < ?')
            ->execute([Time::datetime($now - self::KEEP_DAYS * self::DAY_MS)]);
    }

    /** @return list<array{at:string,action:string,target:string,detail:string}> newest first */
    public function recent(int $limit = 50): array
    {
        $stmt = $this->pdo->prepare('SELECT at, action, target, detail FROM admin_audit ORDER BY at DESC, id DESC LIMIT :n');
        $stmt->bindValue('n', max(1, $limit), PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'at' => (string) $r['at'],
            'action' => (string) $r['action'],
            'target' => (string) $r['target'],
            'detail' => (string) $r['detail'],
        ], $stmt->fetchAll());
    }
}
