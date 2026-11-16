-- PRISM history server, sixth schema: how many visitors have starred each stream.
-- One counter per stream, keyed by the stream's short public id. There is no visitor column on purpose: the server
-- is only told "+1" or "-1" (the browser remembers what it has starred), so nothing about a visitor is kept. The
-- count is a popularity signal, not a poll. All times are UTC. Every statement is safe to run again.
CREATE TABLE IF NOT EXISTS stream_favorites (
  public_id CHAR(12) NOT NULL,
  n INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (public_id),
  KEY idx_stream_favorites_n (n)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
