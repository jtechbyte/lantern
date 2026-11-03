# Lantern 0.1.4

Metadata recovery, portrait artwork, carousel keyboard accessibility and standardized production Compose deployment. The approved Overview and sidebar are preserved.

## Installation and updates

Use [docker-compose.yml](../docker-compose.yml), which pins jctechmin/lantern:0.1.4. The mirror is ghcr.io/jtechbyte/lantern:0.1.4. Follow [Docker deployment](DOCKER.md) and [Operations](OPERATIONS.md) for backup, update and restore commands. Preserve the existing project identity, private .env and volume names when renaming files or directories. Older archives use compose.image.yaml.

This patch introduces no schema migration. Version 0.1.3 introduced migration 6; reverting to 0.1.2 or earlier requires a compatible pre-migration backup. For rollback to 0.1.3, retain the new Compose filename, set LANTERN_IMAGE to the previous verified tag/digest, and recreate Lantern using the same project and volumes. Back up first. Older-image rollback has not been tested.

## Verification

See [final feature and Compose verification](FINAL_CAROUSEL_VERIFICATION.md). Final release builds and anonymous registry deployment verification passed as detailed below. Stable aliases are promoted only after both architectures pass anonymous deployment checks against both registries.

## Limitations

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback: **Not tested - unverified**. Public DNS, public ACME issuance and the user's firewall remain unverified. Metadata and artwork depend on upstream provider availability and accuracy. Image caching is browser-managed. No running user installation is updated by this release.

## Published verification - November 3, 2026

Release source: [dab294a6488e20c2e7de4d6081459f4399924f5e](https://github.com/jtechbyte/lantern/commit/dab294a6488e20c2e7de4d6081459f4399924f5e). [GitHub release](https://github.com/jtechbyte/lantern/releases/tag/v0.1.4). [Publishing workflow 41623571014](https://github.com/jtechbyte/lantern/actions/runs/41623571014) succeeded.

Both native linux/amd64 and linux/arm64 builds passed all 131 tests and isolated production-container checks. Four fresh verification jobs anonymously pulled the published digest from Docker Hub and GHCR on each architecture. All passed PostgreSQL initialization, authentication/login, save/refresh, settings and metadata persistence through restart/recreation, health failure/recovery, backup/restore and local-CA Caddy HTTPS. Stable alias promotion completed only afterward. Anonymous registry manifest checks confirmed all aliases resolve to the same digest.

Repositories: [jctechmin/lantern](https://hub.docker.com/r/jctechmin/lantern) and ghcr.io/jtechbyte/lantern. Both publish tags `0.1.4`, `0.1`, `0`, `latest` and `sha-dab294a6488e20c2e7de4d6081459f4399924f5e`. Docker Hub also retains tested native tags `sha-dab294a6488e20c2e7de4d6081459f4399924f5e-amd64` and `sha-dab294a6488e20c2e7de4d6081459f4399924f5e-arm64`.

Shared multi-architecture digest: `sha256:4118d384d58ccad44ea633f3d9d98a6c7045c0545b90c0ee2f88f26731a867de`. AMD64 manifest: `sha256:8d16fb0468f9ba93fe8842b06839f87e2b68c76127d014b83be401c2fbdb58f2`. ARM64 manifest: `sha256:9f6c787e43c609504e384daf4cac8150de2af0a597b7d8daabc10e9e05ea145e`.

Pre-release verification [41622605568](https://github.com/jtechbyte/lantern/actions/runs/41622605568) additionally passed actual 125%, 150% and 200% browser zoom on both architectures. An earlier pre-release run caught stale 0.1.3 runtime version strings after the package bump; these were corrected before tagging. The merged release tree is identical to the corrected, tested revision. No production installation was changed. The previously documented manual Stremio, provider-account, movie/episode playback and public DNS/ACME checks remain **Not tested - unverified**.
