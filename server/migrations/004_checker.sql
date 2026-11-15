-- PRISM history server, fourth schema: what the stream checker records about each stream
-- (docs/superpowers/specs/2026-11-14-playlist-checker-design.md, piece 3a). All times are UTC. Every statement is safe to run again.

-- The stream's host (lower case, no port): workers own the streams whose host falls in their slice, and the reports group by it.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS host VARCHAR(255) NOT NULL DEFAULT '';

-- Whether the stream has ever passed a check (the host guard and the suspect grace only protect streams that have), and the
-- failure bookkeeping: how many different UTC days it has failed on, and the last of them.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS ever_passed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS fail_days TINYINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS last_fail_day DATE NULL;

-- The latest check: its result code (a fixed word, never text from the other side) and the bytes it read. last_checked_at and
-- facts_json already exist.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS check_result VARCHAR(20) NULL;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS check_bytes INT UNSIGNED NULL;

-- When the state or its reason last changed (a dead stream is removed 14 days after this), and when the stream is next due.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS state_changed_at DATETIME NULL;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS next_check_at DATETIME NULL;

-- Streams already stored: the host is the text between the scheme and the first slash or colon; a stream that is working was
-- put there by hand (the demos), so it counts as having passed.
UPDATE streams SET host = LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(url, '/', 3), '//', -1), ':', 1)) WHERE host = '';
UPDATE streams SET ever_passed = 1 WHERE state = 'working';

CREATE INDEX IF NOT EXISTS idx_streams_host ON streams (host);
CREATE INDEX IF NOT EXISTS idx_streams_due ON streams (state, next_check_at);
