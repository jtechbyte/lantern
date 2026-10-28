# Maintenance and recovery

These commands use the published-image deployment, `compose.image.yaml`. For a source-build installation, use `compose.yaml` instead and rebuild only when updating application code. Run commands from the deployed project directory and include any existing private override files. Keep `.env`, Compose identity, and named volumes. PostgreSQL owns active data; the legacy SQLite volume is not an up-to-date backup. Backups contain secrets: store them privately and keep an off-host copy.

## Restart and inspect

```sh
docker compose -f compose.image.yaml restart lantern
docker compose -f compose.image.yaml ps
docker compose -f compose.image.yaml logs --tail=100 lantern postgres
curl -fsS http://127.0.0.1:7001/healthz
```

Settings, index, watchlist, installation identity, and profiles persist. Memory-only resolved links, provider cooldowns, and in-flight work do not. The minute worker resumes cleanup, DMM imports, and eligible monitored searches. A healthy database is required. Use the configured host binding if not loopback.

## Create a backup before updating

These Bash commands use a consistent PostgreSQL dump while the app is running. The subshell keeps restrictive backup permissions from leaking into later source extraction.

```bash
(
set -euo pipefail
umask 077
stamp=$(date +%Y%m%d-%H%M%S)
backup="$HOME/lantern-backups/$stamp"
mkdir -p "$backup"
tar --exclude='./node_modules' --exclude='./.git' --exclude='./artifacts' \
    --exclude='./experiments' --exclude='./data' --exclude='./backups' \
    --exclude='*.zip' -czf "$backup/source-and-env.tar.gz" .
docker compose -f compose.image.yaml exec -T postgres pg_dump -U lantern -d lantern -Fc > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose -f compose.image.yaml exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database-contents.txt"
container=$(docker compose -f compose.image.yaml ps -q lantern)
test -n "$container"
image=$(docker inspect --format '{{.Image}}' "$container")
docker image tag "$image" "lantern:rollback-$stamp"
printf '%s\n' "lantern:rollback-$stamp" > "$backup/image-name.txt"
docker image save "lantern:rollback-$stamp" | gzip > "$backup/application-image.tar.gz"
test -s "$backup/application-image.tar.gz"
printf 'Backup: %s\n' "$backup"
)
```

The source archive includes `.env` and deployment configuration. Confirm the dump listing and keep the original encryption key. Back up any customized external proxy configuration separately. Caddy can reissue certificates when DNS/ports work; for complete proxy-state recovery, back up its named volumes too. This procedure does not claim to snapshot every Docker volume.

## Update

Read release notes and create the backup above first. Set `LANTERN_IMAGE` in `.env` to your selected stable image tag or digest; the current default is `jctechmin/lantern:0.1.1`. For a Git checkout, inspect local modifications before choosing a published tag:

```sh
git status --short
git fetch --tags origin
# Replace this with the actual published release tag you selected.
git switch --detach v0.1.1
docker compose -f compose.image.yaml config --quiet
docker compose -f compose.image.yaml pull lantern
docker compose -f compose.image.yaml up -d --no-build --wait --wait-timeout 120 lantern
curl -fsS http://127.0.0.1:7001/healthz
docker compose -f compose.image.yaml exec -T lantern node scripts/check-deployment.mjs http://127.0.0.1:7001
```

Do not discard local edits to get a clean checkout. Preserve `.env`, custom Compose/Caddy settings, and any `COMPOSE_PROJECT_NAME`. For ZIP updates, verify the release's checksum when supplied, extract into a separate directory with `umask 022`, compare files, and transfer reviewed application files. Never replace `.env`, database data, or `node_modules` with someone else's files. Follow release-specific removal instructions; ZIP extraction does not remove retired files.

Application startup applies supported schema migrations. Older code rejects a newer schema; do not assume an old image can read upgraded data. Hard-refresh the dashboard, check saved settings and profiles, then test the actual Stremio installation. A healthy process alone is not the full acceptance check.

## Restore without overwriting the existing database

Use a trusted backup and the matching encryption key. Select its real absolute directory below. Stop the application, restore into a **new** database, and retain the original database until verification is complete. The commands assume the default role/database names; adapt them if you deliberately customized those.

```bash
(
set -euo pipefail
backup="$HOME/lantern-backups/REPLACE_WITH_BACKUP_TIMESTAMP"
test -s "$backup/database.dump"
docker compose -f compose.image.yaml stop lantern
docker compose -f compose.image.yaml exec -T postgres createdb -U lantern lantern_restore
docker compose -f compose.image.yaml exec -T postgres pg_restore -U lantern -d lantern_restore \
    --no-owner --exit-on-error < "$backup/database.dump"
)
```

`createdb` intentionally fails if that restore database already exists. Choose a new name for each attempt instead of deleting data. Restore the backup's `.env` and compatible application source in a separate recovery directory first; review them before replacing deployed files. Changing `POSTGRES_PASSWORD` in `.env` does not reset the password of an existing database role.

Create `compose.restore.yaml` in the project directory:

```yaml
services:
  lantern:
    environment:
      PGDATABASE: lantern_restore
```

```sh
docker compose -f compose.image.yaml -f compose.restore.yaml up -d --no-build --wait --wait-timeout 120 lantern
curl -fsS http://127.0.0.1:7001/healthz
```

Keep using both `-f` arguments until the chosen database is deliberately made permanent in deployment configuration. Verify settings decrypt, counts and installation identities match, and profiles work. Native PostgreSQL dump/restore into a separate database was verified on AMD64 and ARM64 during the [0.1.1 image release](DOCKER_VERIFICATION.md). Recovery of your own backup still needs verification; older-image rollback was not tested.

## Rollback

Keep both the failed-upgrade database and backup. If no schema changed, the saved image can be used with the current database. If schema compatibility changed, restore the pre-update dump into a fresh database using the procedure above and its original encryption key. Updates made after that backup will not appear in the restored snapshot.

Load the saved image if it is no longer local:

```sh
gunzip -c /absolute/path/to/backup/application-image.tar.gz | docker image load
```

Create `compose.rollback.yaml`, using the exact tag in `image-name.txt` and the correct restored database:

```yaml
services:
  lantern:
    image: lantern:rollback-REPLACE_WITH_BACKUP_TIMESTAMP
    environment:
      PGDATABASE: lantern_restore
```

```sh
docker compose -f compose.image.yaml -f compose.rollback.yaml up -d --no-build --pull never --wait --wait-timeout 120 lantern
```

Retain the override on subsequent commands so you do not accidentally rebuild the failed version. Review matching old Compose/source files if service configuration changed. For rollback to SQLite, use the old image/configuration with the preserved legacy volume; PostgreSQL-only changes cannot appear in the old SQLite snapshot. Never use `down -v` as a rollback step.

## Resource behavior

One process runs the minute worker with overlap prevention. Discovery allows four concurrent searches with a 12-second budget; sources are paced and 403/429 triggers a 15-minute cooldown. Provider resolution has its own concurrency/deadline limits. Source refresh is governed by saved settings. Behind a reverse proxy, clients share a socket-IP request limit (180/minute); the health endpoint is exempt.

Automatic retention protects settings, profiles, watchlists, tokens, and explicit manual mappings. Monitor disk/WAL and host memory independently: a logical application budget is not a filesystem quota. Error logging is intentionally restrained; scrub logs and URL paths before sharing them.
