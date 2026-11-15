<?php

declare(strict_types=1);

namespace Prism\History\Net;

/**
 * Which addresses the guarded fetcher may contact: the schemes and the ports. The logo copier keeps its original,
 * narrow policy (http and https on ports 80 and 443). The stream checker may only speak https, because an http address
 * cannot play on PRISM's https page, and may use ports 80, 443 and 1024 up, except the ports browsers refuse.
 */
final class FetchPolicy
{
    /**
     * The ports a browser refuses to connect to at 1024 and above: Chromium's `kRestrictedPorts` in net/base/port_util.cc
     * (the ones below 1024 do not matter, the checker allows only 80 and 443 there). Copied 2026-11-15; check it again when
     * Chromium's list changes.
     */
    private const RESTRICTED = [1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080];

    private function __construct(private bool $checker)
    {
    }

    /** What the logo copier has always been allowed: http and https on ports 80 and 443. */
    public static function logos(): self
    {
        return new self(false);
    }

    /** What the stream checker is allowed: https only, ports 80, 443 and 1024 to 65535 minus the browser-restricted ports. */
    public static function checker(): self
    {
        return new self(true);
    }

    public function allows(string $scheme, int $port): bool
    {
        return $this->schemeAllowed($scheme) && $this->portAllowed($port);
    }

    public function schemeAllowed(string $scheme): bool
    {
        $scheme = strtolower($scheme);

        return $this->checker ? $scheme === 'https' : ($scheme === 'http' || $scheme === 'https');
    }

    public function portAllowed(int $port): bool
    {
        if ($port === 80 || $port === 443) {
            return true;
        }

        return $this->checker && $port >= 1024 && $port <= 65535 && !in_array($port, self::RESTRICTED, true);
    }
}
