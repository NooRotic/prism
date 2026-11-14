-- PRISM history server, third schema: the playlist of HLS and DASH streams
-- (docs/superpowers/specs/2026-11-13-playlist-admin-design.md, piece 2). All times are UTC. Every statement is safe to run again.

-- One row per stream. The key is the SHA-256 of the normalised address, never a list position; public_id is its first
-- 12 characters (the short id in page addresses). A removed stream keeps its row as a tombstone so a re-import cannot
-- bring it back. Only the states new, working and suspect are ever shown to visitors.
CREATE TABLE IF NOT EXISTS streams (
  id CHAR(64) NOT NULL,
  public_id CHAR(12) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  name VARCHAR(200) NOT NULL,
  groups_json VARCHAR(400) NOT NULL,
  country CHAR(2) NULL,
  kind ENUM('hls','dash') NOT NULL DEFAULT 'hls',
  state ENUM('new','working','suspect','dead','removed','unplayable','held') NOT NULL DEFAULT 'new',
  state_reason VARCHAR(20) NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(60) NOT NULL,
  logo_url VARCHAR(500) NULL,
  logo_file VARCHAR(40) NULL,
  logo_tries TINYINT UNSIGNED NOT NULL DEFAULT 0,
  added_at DATETIME NOT NULL,
  last_checked_at DATETIME NULL,
  facts_json TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_streams_public_id (public_id),
  KEY idx_streams_state (state),
  KEY idx_streams_pinned (pinned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
