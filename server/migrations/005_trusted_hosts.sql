-- PRISM history server, fifth schema: hosts the owner has vouched for
-- (restore by host). The checker runs from one datacenter, so a host that blocks or misroutes that address fails every check
-- while playing fine for visitors. The owner trusts such a host after trying one of its streams; its streams are shown, and a
-- failing check there is recorded but never hides them. All times are UTC. Every statement is safe to run again.
CREATE TABLE IF NOT EXISTS trusted_hosts (
  host VARCHAR(255) NOT NULL,
  added_at DATETIME NOT NULL,
  PRIMARY KEY (host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
