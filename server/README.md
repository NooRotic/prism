# PRISM history server

A small, dependency-free PHP 8.4 service that remembers daily TwitchTracker snapshots for every channel PRISM
visitors open. Design: [docs/superpowers/specs/2026-11-12-history-server-design.md](../docs/superpowers/specs/2026-11-12-history-server-design.md).
Plan: [docs/superpowers/plans/2026-11-12-history-server.md](../docs/superpowers/plans/2026-11-12-history-server.md).

`server/` mirrors the host: its contents upload to `/prism-data/` on the IONOS webspace
(`server/public/` becomes `/prism-data/public/`, the only web-reachable part). The real `config.php`
(Twitch secret, database login) is created by the owner on the host, never committed, and never read by tooling.

## Deploy

`node server/tools/deploy.mjs` lists what would go to the host; add `--go` to upload over password SFTP (pinned host
key, `IONOS_SSH_PASSWORD` from the environment or a gitignored `.env`; options `--config` and `--env-file`). It never
uploads `config.php`. Classes go up first and `public/` last, so a request during an upgrade never meets a new front
controller with old classes. It only adds and replaces files: a file you remove from `server/` stays on the host until
you delete it by hand. Unlike the owner's inferno recipe there is no scp fallback: without a password it stops with a
message.

## IONOS host notes

- **Which PHP.** The scripts in `bin/` are command line only (they exit unless `PHP_SAPI` is `cli`). On this host the
  default `php` is 4.4.9 and `php8.4` is the CGI build, so use **`/usr/bin/php8.4-cli`** for the install script, the
  cron job and `remove-channel.php`. Over SSH the working directory is the webspace root, so
  `/usr/bin/php8.4-cli prism-data/bin/install.php` creates the tables.
- **Database.** Each database has its own login in the IONOS panel, and `db.name` in `config.php` must be the
  database's own name (`dbs` and digits), not its description. A login that is valid but not allowed into the named
  database fails with MySQL error 1044 (the server reports only "Database connection failed" by design).
- **Contact address.** `tt.user_agent` must carry a real contact address; the server refuses the example one.

## Tests

PHP runs in Docker at the host's version (8.4) and MariaDB at 10.11. The host's database is MariaDB 11.8, which the
panel chose by default: every table pins its own collation (`utf8mb4_unicode_ci`), but the suite has not been run
against 11.8. PHPUnit is a dev dependency of the test image only.

```bash
docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit
```

- The first run builds the image and pulls the base images.
- If `composer.json` changes, reset the cached vendor volume once: `docker compose -f server/docker-compose.test.yml down -v`.
- Stop the test database with `docker compose -f server/docker-compose.test.yml down`.
