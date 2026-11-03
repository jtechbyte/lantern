# Lantern 0.1.6

Filmstrip heading and full-card-centered gutter arrows with contained circular highlights. The approved dashboard, sidebar, artwork proportions and application behavior are preserved.

## Verification

See [whole-card verification and viewport screenshots](CAROUSEL_GUTTER_ARROWS_REVIEW.md). Pre-release feature verification passed 131 tests, browser navigation and native AMD64/ARM64 production builds. Final versioned build and publication verification passed as recorded below.

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

## Published verification - November 3, 2026

[Release source 1c4178ed0cfa4758a7253b6d6016044d118d13f4](https://github.com/jtechbyte/lantern/commit/1c4178ed0cfa4758a7253b6d6016044d118d13f4) was merged through PR #4. [GitHub release](https://github.com/jtechbyte/lantern/releases/tag/v0.1.6). [Publishing workflow 41654415828](https://github.com/jtechbyte/lantern/actions/runs/41654415828) succeeded.

Native linux/amd64 and linux/arm64 builds passed 131 tests and isolated production-container checks. Four fresh jobs anonymously pulled from Docker Hub and GHCR on both architectures and passed Compose/PostgreSQL initialization, login, save/refresh, settings and metadata persistence through restart/recreation, health failure/recovery, backup/restore and local-CA Caddy HTTPS. Stable aliases advanced only after all four jobs passed. Independent anonymous manifest checks confirmed all tags resolve to the expected digest.

Images: jctechmin/lantern and ghcr.io/jtechbyte/lantern. Tags: 0.1.6, 0.1, 0, latest and sha-1c4178ed0cfa4758a7253b6d6016044d118d13f4. Docker Hub also retains native sha-1c4178ed0cfa4758a7253b6d6016044d118d13f4-amd64 and sha-1c4178ed0cfa4758a7253b6d6016044d118d13f4-arm64 tags.

Multi-architecture digest (both registries): sha256:719f908a5b8fdf3dc7036aab9fad712bcf928a976bd315167a95b345fff91e74.

- AMD64: sha256:7d859edb341b6d48d20ac131ebc1bc0fea343f99db7d27aba08e0b14e535460c
- ARM64: sha256:6d70e9715d7d86ba2d880f220a4b334919ceef53ac07ad36a704525ed1e6015f

[Final pre-release validation 41653191305](https://github.com/jtechbyte/lantern/actions/runs/41653191305) passed native builds, the four-viewport browser suite and actual 125%/150%/200% zoom at b8b43b945bdc99784791e51da1d98aa12fcdc91e. The merged release tree is identical. Earlier run 41652502195 failed an immediate keyboard-scroll assertion after advancing the mocked JavaScript clock. The test now waits up to three seconds for native scrolling, without repeating the click or changing application code; both architectures then passed.

All manual limitations above remain **Not tested - unverified**. No running user installation was updated.
