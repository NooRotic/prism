<?php

declare(strict_types=1);

namespace Prism\History\Tv;

use Prism\History\Store\AuditStore;
use Prism\History\Store\JobState;

/**
 * What the owner set for PRISM's TV page in /admin: today only the look of the QR code on its share card. Kept in the
 * key-value table, so it needs no migration. The TV reads it (GET /api/tv); the owner sets it (POST /api/admin/tv).
 */
final class TvSettings
{
    public const STYLES = ['a', 'b', 'c'];
    /** Rainbow on dark: the owner's pick when the TV page was built. */
    public const DEFAULT_STYLE = 'b';
    private const KEY = 'tv_qr_style';

    public function __construct(private JobState $state, private AuditStore $audit)
    {
    }

    public function qrStyle(): string
    {
        $style = $this->state->get(self::KEY);

        return in_array($style, self::STYLES, true) ? $style : self::DEFAULT_STYLE;
    }

    /** False for anything but a known style; every change is written to the admin audit. */
    public function setQrStyle(string $style): bool
    {
        if (!in_array($style, self::STYLES, true)) {
            return false;
        }
        $before = $this->qrStyle();
        $this->state->set(self::KEY, $style);
        $this->audit->record('tv_qr_style', '', $before . ' -> ' . $style);

        return true;
    }
}
