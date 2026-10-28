# Changelog

Only changes established by the local source and audit records are listed. There was no Git history or prior public release tag in the reviewed project; internal ZIP revisions are not presented as separate public releases.

## 0.1.1 — Docker image packaging

- Multi-stage non-root runtime image with production dependencies, migration/maintenance tools, and OCI source/version/license metadata.
- Pull-based Compose deployment preserving PostgreSQL services and volume identity.
- Native AMD64/ARM64 build and runtime checks; release-only publication, separate stable/prerelease tags, and anonymous post-publication checks.
- Published `jctechmin/lantern:0.1.1` on Docker Hub for linux/amd64 and linux/arm64; both passed anonymous pull and native deployment checks.
- Complete published-image installation and maintenance instructions, with a sanitized environment reference and isolated clean-install workflow.
- No database schema or UI layout changes. See [verification results](docs/DOCKER_VERIFICATION.md).

## 0.1.0 — initial release candidate

### Included

- Self-hosted Stremio movie/episode discovery with YTS, EZTV, API Bay, and optional bounded DMM metadata imports.
- PostgreSQL persistence, transactional migrations, and explicit legacy SQLite import.
- Real-Debrid resolution, exact episode selection, empirical filename checks, and account-specific rejection handling.
- Owner dashboard, editable appearance/preferences, search diagnostics, explicit monitoring, imports, cleanup previews, and activity history.
- Invite-only profiles with separate tokens/preferences, expiring one-use invitations, and revocation.
- Docker Compose deployment with optional Caddy HTTPS.

### Pre-release fixes

- Corrected manifest ownership in the non-root Docker build.
- Added bounded browser API timeouts and readable non-JSON error feedback.
- Fixed manual-mapping deletion counts and dirty tracking after a committed save whose readback fails.
- Prevented stale guest responses from reopening a locked profile and blocked duplicate guest submissions.
- Corrected empty settings-request validation and the EZTV diagnostic's episode probe.
- Removed confirmed retired source modules and unused dependencies while retaining configuration/migration compatibility.

### Documentation

- Public installation, user, operations, troubleshooting, contribution, and security guides.
- MIT license, sanitized environment reference, third-party notices, and screenshots from isolated fixtures.

### Known limits

- Native Docker/PostgreSQL, public TLS/proxy operation, physical mobile keyboards, and live authenticated provider/Stremio playback still require verification. No notification feature, direct P2P playback, or complete-catalog guarantee is advertised.
