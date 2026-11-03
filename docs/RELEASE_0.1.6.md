# Lantern 0.1.6

Filmstrip heading and full-card-centered gutter arrows with contained circular highlights. The approved dashboard, sidebar, artwork proportions and application behavior are preserved.

## Verification

See [whole-card verification and viewport screenshots](CAROUSEL_GUTTER_ARROWS_REVIEW.md). Pre-release feature verification passed 131 tests, browser navigation and native AMD64/ARM64 production builds. Final versioned build and publication verification are pending.

## Installation, update and rollback

Use [docker-compose.yml](../docker-compose.yml), pinning jctechmin/lantern:0.1.6, or set LANTERN_IMAGE=ghcr.io/jtechbyte/lantern:0.1.6. Follow [Docker deployment](DOCKER.md) and [backup/restore operations](OPERATIONS.md). Preserve your existing .env, Compose project identity, services and volumes.

After backing up, set LANTERN_IMAGE=jctechmin/lantern:0.1.6 in .env, then run:

```sh
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --wait --wait-timeout 120
curl -fsS http://127.0.0.1:7001/healthz
```

Use the same -p project-name argument if your existing deployment requires it. Never remove volumes during an update. This patch adds no migration. To roll back to 0.1.5, set LANTERN_IMAGE=jctechmin/lantern:0.1.5 and repeat pull/up with the same project and volumes. Older-image rollback is unverified. Returning to pre-0.1.3 requires a compatible pre-migration database backup.

## Limitations

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback: **Not tested - unverified**. Public DNS/ACME and the user's firewall are unverified; isolated local-CA HTTPS is tested. Metadata/artwork depend on upstream availability. Image caching is browser-managed. No running user installation is updated by publishing.

