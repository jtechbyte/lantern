# Lantern 0.1.5

Whole-card carousel alignment and contained highlights. The approved dashboard, sidebar, artwork proportions and application behavior are preserved.

## Verification

See [whole-card verification and viewport screenshots](WHOLE_CARD_CAROUSEL_REVIEW.md). Pre-release feature verification passed 131 tests, browser navigation and native AMD64/ARM64 production builds. Final versioned build and publication checks passed; evidence follows below.

## Installation, update and rollback

Use [docker-compose.yml](../docker-compose.yml), pinning jctechmin/lantern:0.1.5, or set LANTERN_IMAGE=ghcr.io/jtechbyte/lantern:0.1.5. Follow [Docker deployment](DOCKER.md) and [backup/restore operations](OPERATIONS.md). Preserve your existing .env, Compose project identity, services and volumes.

After backing up, set LANTERN_IMAGE=jctechmin/lantern:0.1.5 in .env, then run:

```sh
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --wait --wait-timeout 120
curl -fsS http://127.0.0.1:7001/healthz
```

Use the same -p project-name argument if your existing deployment requires it. Never remove volumes during an update. This patch adds no migration. To roll back to 0.1.4, set LANTERN_IMAGE=jctechmin/lantern:0.1.4 and repeat pull/up with the same project and volumes. Older-image rollback is unverified. Returning to pre-0.1.3 requires a compatible pre-migration database backup.

## Limitations

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback: **Not tested - unverified**. Public DNS/ACME and the user's firewall are unverified; isolated local-CA HTTPS is tested. Metadata/artwork depend on upstream availability. Image caching is browser-managed. No running user installation is updated by publishing.

## Published verification - November 3, 2026

Release source: [02c4dd2960108bd644f1b19071490499d9cd392b](https://github.com/jtechbyte/lantern/commit/02c4dd2960108bd644f1b19071490499d9cd392b). [GitHub release](https://github.com/jtechbyte/lantern/releases/tag/v0.1.5). [Publishing workflow 41642980380](https://github.com/jtechbyte/lantern/actions/runs/41642980380) succeeded.

Both native linux/amd64 and linux/arm64 builds passed 131 tests and production-container verification. Four fresh jobs anonymously pulled the published digest from Docker Hub and GHCR on each architecture and passed isolated Compose/PostgreSQL initialization, authentication, save/refresh, settings and metadata/retry persistence through restart/recreation, health failure/recovery, backup/restore, and local-CA Caddy HTTPS. Stable aliases advanced only afterward. Independent anonymous manifest checks confirmed every alias matches the versioned digest.

Repositories: [jctechmin/lantern](https://hub.docker.com/r/jctechmin/lantern) and ghcr.io/jtechbyte/lantern. Both publish tags 0.1.5, 0.1, 0, latest and sha-02c4dd2960108bd644f1b19071490499d9cd392b. Docker Hub also retains sha-02c4dd2960108bd644f1b19071490499d9cd392b-amd64 and sha-02c4dd2960108bd644f1b19071490499d9cd392b-arm64.

Shared multi-architecture digest: sha256:6c5e19f50d083962e8b007efab3ae83f781a62bf70110343005ee33b6550d8ae. AMD64 manifest: sha256:7e75f31889cfc6aefc2f1dd4ae1c6f1d0eaa22cd96db8680287f3f102b4de471. ARM64 manifest: sha256:a648a056fb73f2616a59b0907af2793d61047772a7d87f8fdcf756ec1bb0ab86.

[Final pre-release validation 41641912247](https://github.com/jtechbyte/lantern/actions/runs/41641912247) tested aaef34e85ed8f064e1f81d98758c0e6f2a269cd0 on both native architectures, including the whole-card browser suite at all four desktop sizes and actual 125%, 150%, 200% browser zoom. The merged release tree is byte-identical to that tested revision. All 23 screenshot URLs returned HTTP 200 from the published tag. The manual limitations above remain unverified; production was not changed.
