# Changelog

Only changes established by the local source and audit records are listed. There was no Git history or prior public release tag in the reviewed project; internal ZIP revisions are not presented as separate public releases.

## 0.1.6 - 2026-11-03

- Use the existing outline-icon system for the amber carousel filmstrip heading.
- Center arrows in measured side gutters against the full card height; preserve whole-card groups and the approved sidebar/layout.
- Contain circular hover/focus highlights and keep disabled arrows muted. Remove one obsolete flex declaration.
- No schema migration or backend behavior changes. Stremio installation, live provider-account verification, movie and episode playback remain **Not tested - unverified**.

## 0.1.5 - 2026-11-03

- Fit complete carousel cards between reserved arrow gutters without squeezing artwork or exposing partial cards.
- Align forward/backward groups and keyboard focus, including the final card; recalculate after resize, filters, sorting and new data.
- Contain amber hover, selected and focus highlights within rounded cards; remove outward glow and movement.
- Preserve the approved dashboard and sidebar, existing APIs and data. No schema migration.
- Stremio installation, live provider-account verification, movie and episode playback remain **Not tested - unverified**.

## 0.1.4 - 2026-11-03

- Recover matching Cinemeta metadata through its validated redirect; persist bounded retry deadlines and retain stale successful metadata honestly.
- Prefer landscape artwork; show portrait-only posters fully over a matching blurred background. Keep missing ratings unavailable.
- Remove artwork content-type overlays and ensure keyboard-focused carousel cards become fully visible without changing the sidebar or approved layout.
- Standardize production deployment on docker-compose.yml; retain docker-compose.build.yml for source builds and preserve project/volume identity.
- Verify native AMD64/ARM64 builds, PostgreSQL persistence, filename changes, local-CA Caddy HTTPS and browser accessibility. No new schema migration.
- Native Stremio installation, real provider-account verification, movie and episode playback remain **Not tested - unverified**.

## 0.1.3 ? 2026-11-02

- Add an Overview-only indexed-title carousel with cached Cinemeta metadata, type filters, date sorting, accessible details and View all.
- Preserve the complete sidebar layout; fit Overview and bottom actions within target desktop viewports using compact status rows and accessible supporting-detail dialogs. Retain document scrolling for smaller or zoomed layouts.
- Add transactional first-indexed timestamps with explicitly estimated backfill dates (migration 6; rollback requires a pre-update database backup).
- Keep failed source results separate from historical successful measurements.
- Validate native AMD64/ARM64 production containers and actual browser zoom; publish through gated Docker Hub/GHCR workflows.
- Stremio installation, live provider-account verification, movie playback, and episode playback: **Not tested ? unverified**.

## 0.1.2 - live database size

- Fourth Overview card measures the connected PostgreSQL database, including tables and indexes, with decimal units and exact byte details.
- Authenticated measurement endpoint returns bigint-safe byte strings and timestamps, coalesces concurrent requests, and caches measurements for five seconds.
- Polls every ten seconds while Overview is visible; loading, unavailable, and stale states retain accurate timestamps.
- Native accuracy/growth and responsive layout checks; browser lifecycle and formatting boundary tests.
- Stable Docker aliases are promoted only after both anonymous architecture deployment checks pass. No schema migration or production-data changes.

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
