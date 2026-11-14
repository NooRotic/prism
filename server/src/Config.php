<?php

declare(strict_types=1);

namespace Prism\History;

use InvalidArgumentException;
use RuntimeException;

/**
 * The server's settings, read from the private config.php the owner creates on the host.
 * Error messages name only the dotted key path, never a value, so a secret cannot leak through one.
 */
final class Config
{
    /** @param array<string,mixed> $a */
    private function __construct(private array $a)
    {
    }

    public static function load(string $path): self
    {
        if (!is_file($path)) {
            throw new RuntimeException('Config file not found');
        }
        $data = (static fn (string $file): mixed => require $file)($path);
        if (!is_array($data)) {
            throw new InvalidArgumentException('Config file must return an array');
        }

        return self::fromArray($data);
    }

    /** @param array<string,mixed> $a */
    public static function fromArray(array $a): self
    {
        $config = new self($a);
        $config->check();

        return $config;
    }

    /** @return array{host:string,name:string,user:string,pass:string} */
    public function db(): array
    {
        return [
            'host' => $this->requireString('db.host'),
            'name' => $this->requireString('db.name'),
            'user' => $this->requireString('db.user'),
            'pass' => $this->requireStringMayBeEmpty('db.pass'),
        ];
    }

    public function twitchClientId(): string
    {
        return $this->requireString('twitch.client_id');
    }

    public function twitchClientSecret(): string
    {
        return $this->requireString('twitch.client_secret');
    }

    /** @return list<string> */
    public function allowedOrigins(): array
    {
        $value = $this->value('allowed_origins');
        if (!is_array($value) || !array_is_list($value)) {
            throw new InvalidArgumentException('Config key allowed_origins must be a list of strings');
        }
        foreach ($value as $origin) {
            if (!is_string($origin) || $origin === '') {
                throw new InvalidArgumentException('Config key allowed_origins must be a list of strings');
            }
        }

        return $value;
    }

    public function ttEnabled(): bool
    {
        return $this->boolOr('tt.enabled', true);
    }

    /** The User-Agent TwitchTracker sees. It must name a real contact, so the placeholder from config.example.php is refused. */
    public function ttUserAgent(): string
    {
        $agent = $this->requireString('tt.user_agent');
        if (stripos($agent, 'example.com') !== false) {
            throw new InvalidArgumentException('Config key tt.user_agent still has the placeholder contact: put a real contact address in it');
        }

        return $agent;
    }

    public function ttGapMs(): int
    {
        return $this->intOr('tt.gap_ms', 1500, 1);
    }

    public function ttRunBudget(): int
    {
        return $this->intOr('tt.run_budget', 300, 1);
    }

    public function ttDayBudget(): int
    {
        return $this->intOr('tt.day_budget', 1500, 1);
    }

    public function tailDays(): int
    {
        return $this->intOr('tracking.tail_days', 30, 1);
    }

    public function newPerHour(): int
    {
        return $this->intOr('tracking.new_per_hour', 20, 0);
    }

    public function newPerDay(): int
    {
        return $this->intOr('tracking.new_per_day', 200, 0);
    }

    public function untrackedRecheckDays(): int
    {
        return $this->intOr('tracking.untracked_recheck_days', 7, 1);
    }

    /** Twitch lookups for logins the service has never seen, per clock hour, so made-up names cannot drain the Twitch budget. */
    public function lookupsPerHour(): int
    {
        return $this->intOr('tracking.lookups_per_hour', 100, 0);
    }

    public function visitsEnabled(): bool
    {
        return $this->boolOr('flags.visits_enabled', true);
    }

    public function newChannelsEnabled(): bool
    {
        return $this->boolOr('flags.new_channels_enabled', true);
    }

    public function logPath(): string
    {
        return $this->requireString('log_path');
    }

    /**
     * The admin keys never throw and are not read by check(): a wrong value switches the admin side off, it does
     * not make the public API answer 500 (the owner edits this file by hand on the host).
     */
    public function adminEnabled(): bool
    {
        $value = $this->value('admin.enabled');

        return $value === null ? true : $value === true;
    }

    /** The owner's numeric Twitch id, or null when it is missing or not 1 to 20 digits. */
    public function adminOwnerTwitchId(): ?string
    {
        $value = $this->value('admin.owner_twitch_id');
        if (is_int($value) && $value > 0) {
            $value = (string) $value;
        }

        return is_string($value) && preg_match('/^\d{1,20}$/', $value) === 1 ? $value : null;
    }

    /** The Twitch client id PRISM's own pages sign in with (public, not a secret), or null. */
    public function adminFrontendClientId(): ?string
    {
        $value = $this->value('admin.frontend_client_id');

        return is_string($value) && $value !== '' ? $value : null;
    }

    /** True only when the admin side is switched on and both ids are set. */
    public function adminActive(): bool
    {
        return $this->adminEnabled() && $this->adminOwnerTwitchId() !== null && $this->adminFrontendClientId() !== null;
    }

    /**
     * Where the visitor snapshot and the playlist import files live: outside public/, so Apache never serves them
     * as plain files. Never throws and is not read by check(): a wrong value means the default.
     */
    public function playlistDataDir(): string
    {
        return $this->stringOr('playlist.data_dir', dirname(__DIR__) . '/data');
    }

    /** Where the copied channel pictures are written: inside public/, so Apache serves them straight. */
    public function playlistLogoDir(): string
    {
        return $this->stringOr('playlist.logo_dir', dirname(__DIR__) . '/public/logos');
    }

    /** Reads every setting once, so a bad config fails when it is loaded, not on first use. */
    private function check(): void
    {
        $this->db();
        $this->twitchClientId();
        $this->twitchClientSecret();
        $this->allowedOrigins();
        $this->ttEnabled();
        $this->ttUserAgent();
        $this->ttGapMs();
        $this->ttRunBudget();
        $this->ttDayBudget();
        $this->tailDays();
        $this->newPerHour();
        $this->newPerDay();
        $this->untrackedRecheckDays();
        $this->lookupsPerHour();
        $this->visitsEnabled();
        $this->newChannelsEnabled();
        $this->logPath();
    }

    private function value(string $path): mixed
    {
        $node = $this->a;
        foreach (explode('.', $path) as $key) {
            if (!is_array($node) || !array_key_exists($key, $node)) {
                return null;
            }
            $node = $node[$key];
        }

        return $node;
    }

    private function requireString(string $path): string
    {
        $value = $this->value($path);
        if (!is_string($value) || $value === '') {
            throw new InvalidArgumentException("Config key {$path} is missing or not a non-empty string");
        }

        return $value;
    }

    private function requireStringMayBeEmpty(string $path): string
    {
        $value = $this->value($path);
        if (!is_string($value)) {
            throw new InvalidArgumentException("Config key {$path} is missing or not a string");
        }

        return $value;
    }

    private function stringOr(string $path, string $default): string
    {
        $value = $this->value($path);

        return is_string($value) && $value !== '' ? $value : $default;
    }

    private function intOr(string $path, int $default, int $min): int
    {
        $value = $this->value($path);
        if ($value === null) {
            return $default;
        }
        if (!is_int($value) || $value < $min) {
            throw new InvalidArgumentException("Config key {$path} must be a whole number of at least {$min}");
        }

        return $value;
    }

    private function boolOr(string $path, bool $default): bool
    {
        $value = $this->value($path);
        if ($value === null) {
            return $default;
        }
        if (!is_bool($value)) {
            throw new InvalidArgumentException("Config key {$path} must be true or false");
        }

        return $value;
    }
}
