-- PRISM history server, second schema: daily usage counters and the owner-only admin side
-- (docs/superpowers/specs/2026-11-13-playlist-admin-design.md). All times are UTC. Every statement is safe to run again.

-- One row per UTC day and counter. Keys: hit:<section>, new_channels, signed_out. Counts only, never about a person.
CREATE TABLE IF NOT EXISTS usage_counters (
  day_utc DATE NOT NULL,
  k VARCHAR(40) NOT NULL,
  n BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day_utc, k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The one place the server holds anything about a person: Twitch users who tried the admin sign-in and were refused
-- (the owner's request). One row per Twitch user, no IP and no browser details. Purged after 90 days, capped at 1,000 rows.
CREATE TABLE IF NOT EXISTS admin_attempts (
  twitch_id VARCHAR(20) NOT NULL,
  login VARCHAR(25) NOT NULL,
  first_attempt_at DATETIME NOT NULL,
  last_attempt_at DATETIME NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  via_script TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (twitch_id),
  KEY idx_attempts_last (last_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What the owner changed through the admin side. No IP. Kept 180 days.
CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  at DATETIME NOT NULL,
  action VARCHAR(40) NOT NULL,
  target VARCHAR(100) NOT NULL,
  detail VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A hash of an owner token Twitch vouched for, so most admin requests need no Twitch call. Never the token itself.
CREATE TABLE IF NOT EXISTS admin_token_cache (
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
