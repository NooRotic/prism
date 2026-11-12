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

## Tests

PHP and MariaDB run in Docker, at the same versions as the host (PHP 8.4, MariaDB 10.11). PHPUnit is a dev
dependency of the test image only.

```bash
docker compose -f server/docker-compose.test.yml run --rm php vendor/bin/phpunit
```

- The first run builds the image and pulls the base images.
- If `composer.json` changes, reset the cached vendor volume once: `docker compose -f server/docker-compose.test.yml down -v`.
- Stop the test database with `docker compose -f server/docker-compose.test.yml down`.
