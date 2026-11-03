# Lantern 0.1.4

Metadata recovery, portrait artwork, carousel keyboard accessibility and standardized production Compose deployment. The approved Overview and sidebar are preserved.

## Installation and updates

Use [docker-compose.yml](../docker-compose.yml), which pins jctechmin/lantern:0.1.4. The mirror is ghcr.io/jtechbyte/lantern:0.1.4. Follow [Docker deployment](DOCKER.md) and [Operations](OPERATIONS.md) for backup, update and restore commands. Preserve the existing project identity, private .env and volume names when renaming files or directories. Older archives use compose.image.yaml.

This patch introduces no schema migration. Version 0.1.3 introduced migration 6; reverting to 0.1.2 or earlier requires a compatible pre-migration backup. For rollback to 0.1.3, retain the new Compose filename, set LANTERN_IMAGE to the previous verified tag/digest, and recreate Lantern using the same project and volumes. Back up first. Older-image rollback has not been tested.

## Verification

See [final feature and Compose verification](FINAL_CAROUSEL_VERIFICATION.md). Final release builds and anonymous registry deployment verification will be recorded after completion. Stable aliases are promoted only after both architectures pass anonymous deployment checks against both registries.

## Limitations

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback: **Not tested - unverified**. Public DNS, public ACME issuance and the user's firewall remain unverified. Metadata and artwork depend on upstream provider availability and accuracy. Image caching is browser-managed. No running user installation is updated by this release.
