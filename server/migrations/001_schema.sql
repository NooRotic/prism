-- PRISM history server, first schema. All times are UTC. See docs/superpowers/specs/2026-11-12-history-server-design.md.
-- (schema_migrations itself is created by the Migrator.)

CREATE TABLE channels (
  twitch_id VARCHAR(20) NOT NULL,
  login VARCHAR(25) NOT NULL,
  display_name VARCHAR(50) NOT NULL DEFAULT '',
  avatar_url VARCHAR(255) NULL,
  broadcaster_type VARCHAR(12) NOT NULL DEFAULT '',
  account_created_at DATETIME NULL,
  language VARCHAR(8) NULL,
  category VARCHAR(100) NULL,
  first_seen_at DATETIME NOT NULL,
  last_visited_at DATETIME NOT NULL,
  tracked_since DATE NOT NULL,
  status ENUM('tracking','dormant','gone') NOT NULL DEFAULT 'tracking',
  profile_checked_at DATETIME NULL,
  PRIMARY KEY (twitch_id),
  KEY idx_channels_login (login),
  KEY idx_channels_status_visited (status, last_visited_at),
  KEY idx_channels_first_seen (first_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per channel per UTC date. The TT figures are trailing 30-day aggregates; followers_change is a net change and can be negative.
CREATE TABLE snapshots (
  twitch_id VARCHAR(20) NOT NULL,
  snap_date DATE NOT NULL,
  tt_rank INT NULL,
  minutes_streamed INT NULL,
  avg_viewers INT NULL,
  max_viewers INT NULL,
  hours_watched BIGINT NULL,
  followers_change INT NULL,
  followers_total BIGINT NULL,
  tt_status ENUM('ok','untracked','error') NOT NULL,
  fetched_at DATETIME NOT NULL,
  PRIMARY KEY (twitch_id, snap_date),
  CONSTRAINT fk_snapshots_channel FOREIGN KEY (twitch_id) REFERENCES channels (twitch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bio_links (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  twitch_id VARCHAR(20) NOT NULL,
  platform ENUM('youtube','kick') NOT NULL,
  url VARCHAR(255) NOT NULL,
  first_seen_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bio_links (twitch_id, platform, url),
  CONSTRAINT fk_bio_links_channel FOREIGN KEY (twitch_id) REFERENCES channels (twitch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blocked_channels (
  twitch_id VARCHAR(20) NOT NULL,
  login VARCHAR(25) NOT NULL,
  blocked_at DATETIME NOT NULL,
  PRIMARY KEY (twitch_id),
  KEY idx_blocked_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE job_state (
  k VARCHAR(64) NOT NULL,
  v TEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The shared TwitchTracker gate: one row holding the time of the last call.
CREATE TABLE tt_gate (
  id TINYINT UNSIGNED NOT NULL,
  last_call_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tt_gate (id, last_call_ms) VALUES (1, 0);
